"""Ranking engine for final scoring."""
from typing import List, Tuple
from datetime import datetime

from backend.models.schemas import NormalizedOpportunity, UserProfile, MatchAnalysis
from backend.config import settings


class RankingEngine:
    """Final ranking engine combining all signals."""

    def __init__(self):
        """Initialize with configurable weights."""
        self.weights = {
            "role": settings.WEIGHT_ROLE,
            "skills": settings.WEIGHT_SKILLS,
            "experience": settings.WEIGHT_EXPERIENCE,
            "location": settings.WEIGHT_LOCATION,
            "freshness": settings.WEIGHT_FRESHNESS,
            "employment": settings.WEIGHT_EMPLOYMENT,
        }

    def compute_role_score(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile
    ) -> float:
        """
        Compute role match score (0-100).

        Args:
            opportunity: Normalized opportunity
            profile: User profile

        Returns:
            Role score
        """
        if not profile.roles:
            return 50.0  # Neutral

        title_lower = opportunity.title.lower()
        matches = sum(1 for role in profile.roles if role.lower() in title_lower)

        if matches > 0:
            return min(100.0, 70.0 + (matches * 15.0))
        return 30.0

    def compute_skill_score(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile
    ) -> float:
        """
        Compute skill match score (0-100).

        Args:
            opportunity: Normalized opportunity
            profile: User profile

        Returns:
            Skill score
        """
        if not opportunity.skills:
            return 50.0  # Neutral - no skill info

        all_profile_skills = []
        skill_weights = {"strong": 1.0, "working": 0.7, "familiar": 0.4}

        for level, weight in skill_weights.items():
            for skill in profile.skills.get(level, []):
                all_profile_skills.append((skill.lower(), weight))

        if not all_profile_skills:
            return 30.0

        matched_weight = 0.0
        total_weight = sum(w for _, w in all_profile_skills)

        for skill_lower, weight in all_profile_skills:
            if any(skill_lower in opp_skill.lower() for opp_skill in opportunity.skills):
                matched_weight += weight

        if total_weight > 0:
            return (matched_weight / total_weight) * 100
        return 50.0

    def compute_experience_score(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile
    ) -> float:
        """
        Compute experience match score (0-100).

        Args:
            opportunity: Normalized opportunity
            profile: User profile

        Returns:
            Experience score
        """
        if opportunity.experience_min is None and opportunity.experience_max is None:
            return 50.0  # Neutral - no requirement

        user_exp = profile.experience_years
        req_min = opportunity.experience_min or 0
        req_max = opportunity.experience_max or float('inf')

        # Perfect match: within range
        if req_min <= user_exp <= req_max:
            return 100.0

        # Under-qualified
        if user_exp < req_min:
            gap = req_min - user_exp
            if gap <= 0.5:
                return 90.0  # Close enough
            elif gap <= 1.0:
                return 70.0
            elif gap <= 2.0:
                return 50.0
            else:
                return 30.0

        # Over-qualified
        if user_exp > req_max:
            excess = user_exp - req_max
            if excess <= 1.0:
                return 95.0
            elif excess <= 2.0:
                return 85.0
            elif excess <= 3.0:
                return 75.0
            else:
                return 60.0  # Significantly overqualified

        return 50.0

    def compute_location_score(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile
    ) -> float:
        """
        Compute location match score (0-100).

        Args:
            opportunity: Normalized opportunity
            profile: User profile

        Returns:
            Location score
        """
        if not profile.locations:
            return 50.0  # Neutral

        if not opportunity.location:
            return 40.0  # Slight penalty for missing location

        opp_loc_lower = opportunity.location.lower()

        for pref_loc in profile.locations:
            pref_loc_lower = pref_loc.lower()

            # Exact match or contains
            if pref_loc_lower == opp_loc_lower:
                return 100.0
            if pref_loc_lower in opp_loc_lower or opp_loc_lower in pref_loc_lower:
                return 90.0

            # Remote matching
            if pref_loc_lower == "remote" and "remote" in opp_loc_lower:
                return 100.0

        return 20.0  # Location mismatch

    def compute_freshness_score(
        self,
        opportunity: NormalizedOpportunity
    ) -> float:
        """
        Compute freshness score (0-100).

        Args:
            opportunity: Normalized opportunity

        Returns:
            Freshness score
        """
        if not opportunity.posted_at:
            return 30.0  # Penalty for missing timestamp

        now = datetime.utcnow()
        age_hours = (now - opportunity.posted_at).total_seconds() / 3600

        # Score decay over time
        if age_hours <= 1:
            return 100.0
        elif age_hours <= 6:
            return 95.0
        elif age_hours <= 12:
            return 90.0
        elif age_hours <= 24:
            return 85.0
        elif age_hours <= 72:
            return 75.0
        elif age_hours <= 168:  # 1 week
            return 65.0
        else:
            return 50.0

    def compute_employment_score(
        self,
        opportunity: NormalizedOpportunity
    ) -> float:
        """
        Compute employment type score (0-100).

        For now, just presence/absence scoring.
        Can be extended with preferences.

        Args:
            opportunity: Normalized opportunity

        Returns:
            Employment score
        """
        if opportunity.employment_type:
            return 100.0
        return 50.0  # Neutral for missing employment type

    def compute_final_score(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile,
        llm_analysis: MatchAnalysis = None
    ) -> Tuple[float, dict]:
        """
        Compute final weighted score.

        Args:
            opportunity: Normalized opportunity
            profile: User profile
            llm_analysis: Optional LLM analysis

        Returns:
            Tuple of (final_score, score_breakdown)
        """
        # Compute individual scores
        role_score = self.compute_role_score(opportunity, profile)
        skill_score = self.compute_skill_score(opportunity, profile)
        experience_score = self.compute_experience_score(opportunity, profile)
        location_score = self.compute_location_score(opportunity, profile)
        freshness_score = self.compute_freshness_score(opportunity)
        employment_score = self.compute_employment_score(opportunity)

        # Override with LLM scores if available
        if llm_analysis:
            role_score = llm_analysis.role_match
            skill_score = llm_analysis.skill_match
            experience_score = llm_analysis.experience_match
            location_score = llm_analysis.location_match

        # Compute weighted average
        final_score = (
            role_score * self.weights["role"] +
            skill_score * self.weights["skills"] +
            experience_score * self.weights["experience"] +
            location_score * self.weights["location"] +
            freshness_score * self.weights["freshness"] +
            employment_score * self.weights["employment"]
        )

        score_breakdown = {
            "role_score": role_score,
            "skill_score": skill_score,
            "experience_score": experience_score,
            "location_score": location_score,
            "freshness_score": freshness_score,
            "employment_score": employment_score,
        }

        return final_score, score_breakdown

    def rank_opportunities(
        self,
        opportunities_with_analysis: List[Tuple[NormalizedOpportunity, MatchAnalysis, float]],
        profile: UserProfile
    ) -> List[Tuple[float, dict, NormalizedOpportunity, MatchAnalysis]]:
        """
        Rank all opportunities.

        Args:
            opportunities_with_analysis: List of (opportunity, analysis, embedding_sim)
            profile: User profile

        Returns:
            List of (final_score, breakdown, opportunity, analysis) sorted by score
        """
        results = []

        for opp, analysis, embedding_sim in opportunities_with_analysis:
            final_score, breakdown = self.compute_final_score(opp, profile, analysis)
            results.append((final_score, breakdown, opp, analysis, embedding_sim))

        # Sort by final score (descending)
        results.sort(key=lambda x: x[0], reverse=True)

        return results
