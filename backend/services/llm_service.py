"""LLM service for analyzing matches."""
import json
from typing import Optional
import httpx

from backend.models.schemas import NormalizedOpportunity, UserProfile, MatchAnalysis
from backend.config import settings


class LLMService:
    """Service for interacting with local LLM (Ollama)."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL
        self.timeout = 120.0  # 2 minutes for LLM calls

    async def analyze_match(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile,
        embedding_similarity: float
    ) -> Optional[MatchAnalysis]:
        """
        Use LLM to analyze match quality.

        Args:
            opportunity: Normalized opportunity
            profile: User profile
            embedding_similarity: Embedding similarity score

        Returns:
            Match analysis or None if LLM fails
        """
        prompt = self._create_analysis_prompt(opportunity, profile, embedding_similarity)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json"
                    }
                )

                if response.status_code != 200:
                    return None

                result = response.json()
                llm_response = result.get("response", "")

                # Parse JSON response
                analysis_data = json.loads(llm_response)

                return MatchAnalysis(**analysis_data)

        except Exception as e:
            print(f"LLM analysis failed: {e}")
            return None

    def _create_analysis_prompt(
        self,
        opportunity: NormalizedOpportunity,
        profile: UserProfile,
        embedding_similarity: float
    ) -> str:
        """
        Create prompt for LLM analysis.

        Args:
            opportunity: Normalized opportunity
            profile: User profile
            embedding_similarity: Embedding similarity score

        Returns:
            Formatted prompt
        """
        # Format profile
        profile_text = f"""
User Profile:
- Target Roles: {', '.join(profile.roles)}
- Experience: {profile.experience_years} years
- Strong Skills: {', '.join(profile.skills.get('strong', []))}
- Working Skills: {', '.join(profile.skills.get('working', []))}
- Familiar Skills: {', '.join(profile.skills.get('familiar', []))}
- Preferred Locations: {', '.join(profile.locations)}
"""

        # Format opportunity
        opp_text = f"""
Opportunity:
- Title: {opportunity.title}
- Company: {opportunity.company or 'Unknown'}
- Location: {opportunity.location or 'Unknown'}
- Skills: {', '.join(opportunity.skills) if opportunity.skills else 'Not specified'}
- Experience: {opportunity.experience_min or '?'} - {opportunity.experience_max or '?'} years
- Description: {opportunity.description[:300] if opportunity.description else 'Not available'}
"""

        prompt = f"""Analyze how well this job opportunity matches the user's profile.

{profile_text}

{opp_text}

Embedding Similarity Score: {embedding_similarity:.2f}

Provide a structured analysis in JSON format with the following fields:
- match_score: Overall match score (0-100)
- role_match: How well the role matches (0-100)
- skill_match: How well skills match (0-100)
- experience_match: How well experience requirements match (0-100)
- location_match: How well location matches (0-100)
- missing_skills: Array of skills the user lacks but the job requires
- strengths: Array of 2-3 key strengths that make this a good match
- summary: One sentence summary of the match quality

Return ONLY valid JSON, no additional text.
"""

        return prompt

    async def classify_job_post(self, post_content: str) -> bool:
        """
        Classify if a LinkedIn post is a job opportunity.

        Args:
            post_content: Post text content

        Returns:
            True if it's a job opportunity
        """
        prompt = f"""Determine if this LinkedIn post is advertising a job opportunity.

Post content:
{post_content[:500]}

A job opportunity post typically:
- Uses phrases like "we are hiring", "looking for", "join our team", "job opening", "vacancy"
- Mentions a specific role or position
- May include "DM me", "apply", "interested candidates"

Return JSON with a single boolean field:
{{"is_job_opportunity": true}}  or  {{"is_job_opportunity": false}}

Return ONLY valid JSON, no additional text.
"""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json"
                    }
                )

                if response.status_code != 200:
                    return False

                result = response.json()
                llm_response = result.get("response", "")

                data = json.loads(llm_response)
                return data.get("is_job_opportunity", False)

        except Exception as e:
            print(f"Post classification failed: {e}")
            # Fallback to keyword matching
            return self._fallback_classify_post(post_content)

    def _fallback_classify_post(self, post_content: str) -> bool:
        """
        Fallback keyword-based post classification.

        Args:
            post_content: Post text content

        Returns:
            True if likely a job opportunity
        """
        content_lower = post_content.lower()

        job_keywords = [
            "hiring", "we are hiring", "we're hiring",
            "looking for", "seeking",
            "job opening", "job opportunity",
            "vacancy", "vacancies",
            "join our team", "join us",
            "apply now", "dm me",
            "recruiter", "recruitment",
            "position available", "opening for",
            "candidates", "freshers",
            "referral"
        ]

        return any(keyword in content_lower for keyword in job_keywords)
