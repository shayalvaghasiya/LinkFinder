"""Embedding-based matching engine."""
import numpy as np
from typing import List, Optional, Tuple
from sentence_transformers import SentenceTransformer
import faiss

from backend.models.schemas import NormalizedOpportunity, UserProfile
from backend.config import settings


class MatchingEngine:
    """Embedding-based semantic matching."""

    def __init__(self):
        """Initialize embedding model."""
        self.model: Optional[SentenceTransformer] = None
        self.profile_embedding: Optional[np.ndarray] = None

    def _load_model(self):
        """Lazy load the embedding model."""
        if self.model is None:
            self.model = SentenceTransformer(settings.EMBEDDING_MODEL)

    def _create_profile_text(self, profile: UserProfile) -> str:
        """
        Create text representation of user profile for embedding.

        Args:
            profile: User profile

        Returns:
            Text representation
        """
        parts = []

        # Roles
        if profile.roles:
            parts.append(f"Target roles: {', '.join(profile.roles)}")

        # Skills
        all_skills = []
        if profile.skills.get("strong"):
            all_skills.extend([f"{s} (expert)" for s in profile.skills["strong"]])
        if profile.skills.get("working"):
            all_skills.extend([f"{s} (proficient)" for s in profile.skills["working"]])
        if profile.skills.get("familiar"):
            all_skills.extend([f"{s} (familiar)" for s in profile.skills["familiar"]])

        if all_skills:
            parts.append(f"Skills: {', '.join(all_skills)}")

        # Experience
        if profile.experience_years:
            parts.append(f"{profile.experience_years} years of experience")

        # Education
        if profile.education:
            parts.append(f"Education: {', '.join(profile.education)}")

        # Certifications
        if profile.certifications:
            parts.append(f"Certifications: {', '.join(profile.certifications)}")

        return ". ".join(parts)

    def _create_opportunity_text(self, opportunity: NormalizedOpportunity) -> str:
        """
        Create text representation of opportunity for embedding.

        Args:
            opportunity: Normalized opportunity

        Returns:
            Text representation
        """
        parts = [opportunity.title]

        if opportunity.company:
            parts.append(f"at {opportunity.company}")

        if opportunity.description:
            # Truncate description to avoid overwhelming the embedding
            desc = opportunity.description[:500]
            parts.append(desc)

        if opportunity.skills:
            parts.append(f"Required skills: {', '.join(opportunity.skills)}")

        if opportunity.location:
            parts.append(f"Location: {opportunity.location}")

        return ". ".join(parts)

    def set_profile_embedding(self, profile: UserProfile):
        """
        Compute and cache profile embedding.

        Args:
            profile: User profile
        """
        self._load_model()
        profile_text = self._create_profile_text(profile)
        self.profile_embedding = self.model.encode([profile_text], normalize_embeddings=True)[0]

    def compute_similarities(
        self,
        opportunities: List[NormalizedOpportunity]
    ) -> List[Tuple[NormalizedOpportunity, float]]:
        """
        Compute similarity scores between profile and opportunities.

        Args:
            opportunities: List of opportunities

        Returns:
            List of (opportunity, similarity_score) tuples
        """
        if self.profile_embedding is None:
            raise ValueError("Profile embedding not set. Call set_profile_embedding first.")

        if not opportunities:
            return []

        self._load_model()

        # Create opportunity texts
        opp_texts = [self._create_opportunity_text(opp) for opp in opportunities]

        # Compute embeddings
        opp_embeddings = self.model.encode(opp_texts, normalize_embeddings=True)

        # Compute cosine similarities (embeddings are normalized, so dot product = cosine sim)
        similarities = np.dot(opp_embeddings, self.profile_embedding)

        # Create result tuples
        results = list(zip(opportunities, similarities.tolist()))

        # Sort by similarity (highest first)
        results.sort(key=lambda x: x[1], reverse=True)

        return results

    def get_top_matches(
        self,
        opportunities: List[NormalizedOpportunity],
        top_n: int = 10,
        min_similarity: Optional[float] = None
    ) -> List[Tuple[NormalizedOpportunity, float]]:
        """
        Get top N matching opportunities.

        Args:
            opportunities: List of opportunities
            top_n: Number of top matches to return
            min_similarity: Minimum similarity threshold

        Returns:
            List of top (opportunity, similarity_score) tuples
        """
        results = self.compute_similarities(opportunities)

        # Apply minimum similarity filter if specified
        if min_similarity is not None:
            results = [(opp, sim) for opp, sim in results if sim >= min_similarity]

        # Return top N
        return results[:top_n]

    def compute_keyword_match_score(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile
    ) -> float:
        """
        Compute keyword-based match score (0-100).

        This provides a rule-based baseline alongside embeddings.

        Args:
            opportunity: Normalized opportunity
            profile: User profile

        Returns:
            Match score (0-100)
        """
        score = 0.0
        max_score = 0.0

        # Role matching (30 points)
        max_score += 30
        if profile.roles:
            title_lower = opportunity.title.lower()
            role_matches = sum(1 for role in profile.roles if role.lower() in title_lower)
            score += min(30, (role_matches / len(profile.roles)) * 30)

        # Skill matching (50 points)
        max_score += 50
        if opportunity.skills:
            all_profile_skills = []
            skill_weights = {"strong": 1.0, "working": 0.7, "familiar": 0.4}

            for level, weight in skill_weights.items():
                for skill in profile.skills.get(level, []):
                    all_profile_skills.append((skill.lower(), weight))

            if all_profile_skills:
                matched_weight = 0.0
                total_weight = sum(w for _, w in all_profile_skills)

                for skill_lower, weight in all_profile_skills:
                    if any(skill_lower in opp_skill.lower() for opp_skill in opportunity.skills):
                        matched_weight += weight

                score += (matched_weight / total_weight) * 50

        # Location matching (20 points)
        max_score += 20
        if profile.locations and opportunity.location:
            opp_loc_lower = opportunity.location.lower()
            if any(loc.lower() in opp_loc_lower for loc in profile.locations):
                score += 20

        # Normalize to 0-100
        if max_score > 0:
            return (score / max_score) * 100
        return 0.0
