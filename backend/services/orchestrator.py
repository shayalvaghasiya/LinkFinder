"""Main processing orchestrator."""
import time
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from backend.models.schemas import (
    BatchProcessRequest, BatchProcessResponse, NormalizedOpportunity,
    RawJob, RawPost, MatchResult, OpportunityType
)
from backend.models.database import Opportunity, Match, ProcessingRun, Profile
from backend.services.filter_engine import FilterEngine
from backend.services.matching_engine import MatchingEngine
from backend.services.ranking_engine import RankingEngine
from backend.services.llm_service import LLMService
from backend.utils.normalization import (
    parse_linkedin_timestamp, parse_experience_requirement,
    generate_fingerprint, extract_linkedin_id, normalize_location
)
from backend.config import settings


class ProcessingOrchestrator:
    """Main orchestrator for processing opportunities."""

    def __init__(self, db: Session):
        self.db = db
        self.filter_engine = FilterEngine()
        self.matching_engine = MatchingEngine()
        self.ranking_engine = RankingEngine()
        self.llm_service = LLMService()

    def normalize_job(self, raw_job: RawJob) -> NormalizedOpportunity:
        """
        Normalize raw job data.

        Args:
            raw_job: Raw job from extraction

        Returns:
            Normalized opportunity
        """
        # Parse timestamp
        posted_at, timestamp_confidence = parse_linkedin_timestamp(raw_job.posted_text)

        # Parse experience
        exp_min, exp_max = parse_experience_requirement(raw_job.experience_text)

        # Extract LinkedIn ID
        linkedin_id = extract_linkedin_id(raw_job.url)

        # Generate fingerprint
        fingerprint = generate_fingerprint(
            raw_job.title,
            raw_job.company,
            raw_job.location,
            raw_job.url
        )

        # Normalize location
        location = normalize_location(raw_job.location) if raw_job.location else None

        return NormalizedOpportunity(
            linkedin_id=linkedin_id,
            fingerprint=fingerprint,
            source=raw_job.source,
            type=raw_job.type,
            title=raw_job.title,
            company=raw_job.company,
            location=location,
            url=raw_job.url,
            posted_at=posted_at,
            timestamp_confidence=timestamp_confidence,
            description=raw_job.description,
            skills=raw_job.skills,
            experience_min=exp_min,
            experience_max=exp_max,
            employment_type=raw_job.employment_type,
            raw_data=raw_job.raw_data
        )

    async def normalize_post(self, raw_post: RawPost) -> NormalizedOpportunity:
        """
        Normalize raw post data.

        Args:
            raw_post: Raw post from extraction

        Returns:
            Normalized opportunity or None if not a job post
        """
        # First, classify if it's a job opportunity
        is_job = await self.llm_service.classify_job_post(raw_post.content)

        if not is_job:
            return None

        # Parse timestamp
        posted_at, timestamp_confidence = parse_linkedin_timestamp(raw_post.posted_text)

        # Extract LinkedIn ID
        linkedin_id = extract_linkedin_id(raw_post.post_url)

        # Generate fingerprint (use author + URL for posts)
        fingerprint = generate_fingerprint(
            raw_post.author,
            "",  # No company for posts
            "",  # No location for posts
            raw_post.post_url
        )

        return NormalizedOpportunity(
            linkedin_id=linkedin_id,
            fingerprint=fingerprint,
            source=raw_post.source,
            type=raw_post.type,
            title=raw_post.author,  # Use author as title for posts
            company=None,
            location=None,
            url=raw_post.post_url,
            posted_at=posted_at,
            timestamp_confidence=timestamp_confidence,
            description=raw_post.content,
            skills=[],
            experience_min=None,
            experience_max=None,
            employment_type=None,
            raw_data=raw_post.raw_data
        )

    def deduplicate_and_store(self, opportunities: List[NormalizedOpportunity]) -> List[Opportunity]:
        """
        Deduplicate and store opportunities in database.

        Args:
            opportunities: List of normalized opportunities

        Returns:
            List of database Opportunity objects
        """
        stored = []

        for opp in opportunities:
            # Check if already exists by fingerprint
            existing = self.db.query(Opportunity).filter(
                Opportunity.fingerprint == opp.fingerprint
            ).first()

            if existing:
                stored.append(existing)
                continue

            # Create new opportunity
            db_opp = Opportunity(
                linkedin_id=opp.linkedin_id,
                fingerprint=opp.fingerprint,
                source=opp.source.value,
                type=opp.type.value,
                title=opp.title,
                company=opp.company,
                location=opp.location,
                url=opp.url,
                posted_at=opp.posted_at,
                timestamp_confidence=opp.timestamp_confidence,
                description=opp.description,
                skills=opp.skills,
                experience_min=opp.experience_min,
                experience_max=opp.experience_max,
                employment_type=opp.employment_type,
                raw_data=opp.raw_data
            )

            self.db.add(db_opp)
            self.db.flush()  # Get ID without committing
            stored.append(db_opp)

        self.db.commit()
        return stored

    async def process_batch(self, request: BatchProcessRequest) -> BatchProcessResponse:
        """
        Process a batch of opportunities.

        Args:
            request: Batch process request

        Returns:
            Batch process response with matches
        """
        start_time = time.time()

        # Get profile
        profile_obj = self.db.query(Profile).filter(Profile.id == request.profile_id).first()
        if not profile_obj:
            raise ValueError(f"Profile {request.profile_id} not found")

        from backend.models.schemas import UserProfile
        profile = UserProfile(**profile_obj.profile_data)

        # Step 1: Normalize
        normalized = []

        for raw_job in request.jobs:
            norm = self.normalize_job(raw_job)
            normalized.append(norm)

        for raw_post in request.posts:
            norm = await self.normalize_post(raw_post)
            if norm:  # Only add if classified as job opportunity
                normalized.append(norm)

        total_received = len(request.jobs) + len(request.posts)
        total_after_classification = len(normalized)

        # Step 2: Deduplicate and store
        stored_opps = self.deduplicate_and_store(normalized)

        # Step 3: Filter
        filtered = self.filter_engine.filter_opportunities(
            normalized,
            profile,
            request.search_config
        )

        # Step 4: Embedding matching
        self.matching_engine.set_profile_embedding(profile)

        top_matches = self.matching_engine.get_top_matches(
            filtered,
            top_n=settings.TOP_N_FOR_LLM,
            min_similarity=settings.MIN_SIMILARITY_SCORE
        )

        # Step 5: LLM analysis
        opportunities_with_analysis = []

        for opp, similarity in top_matches:
            analysis = await self.llm_service.analyze_match(opp, profile, similarity)
            opportunities_with_analysis.append((opp, analysis, similarity))

        # Step 6: Ranking
        ranked = self.ranking_engine.rank_opportunities(opportunities_with_analysis, profile)

        # Step 7: Store matches
        match_results = []

        for final_score, breakdown, opp, analysis, embedding_sim in ranked:
            # Find stored opportunity
            stored_opp = next((o for o in stored_opps if o.fingerprint == opp.fingerprint), None)
            if not stored_opp:
                continue

            # Create match
            db_match = Match(
                opportunity_id=stored_opp.id,
                profile_id=request.profile_id,
                final_score=final_score,
                role_score=breakdown["role_score"],
                skill_score=breakdown["skill_score"],
                experience_score=breakdown["experience_score"],
                location_score=breakdown["location_score"],
                freshness_score=breakdown["freshness_score"],
                employment_score=breakdown["employment_score"],
                embedding_similarity=embedding_sim,
                llm_analysis=analysis.model_dump() if analysis else None
            )

            self.db.add(db_match)

            # Create result
            match_result = MatchResult(
                opportunity_id=stored_opp.id,
                profile_id=request.profile_id,
                final_score=final_score,
                role_score=breakdown["role_score"],
                skill_score=breakdown["skill_score"],
                experience_score=breakdown["experience_score"],
                location_score=breakdown["location_score"],
                freshness_score=breakdown["freshness_score"],
                employment_score=breakdown["employment_score"],
                embedding_similarity=embedding_sim,
                analysis=analysis,
                title=opp.title,
                company=opp.company,
                location=opp.location,
                url=opp.url,
                posted_at=opp.posted_at
            )

            match_results.append(match_result)

        # Step 8: Store processing run
        processing_time = time.time() - start_time

        run = ProcessingRun(
            profile_id=request.profile_id,
            total_received=total_received,
            total_processed=total_after_classification,
            total_filtered=len(filtered),
            total_matched=len(match_results),
            processing_time_seconds=processing_time,
            search_config=request.search_config.model_dump(),
            stats={
                "jobs_received": len(request.jobs),
                "posts_received": len(request.posts),
                "posts_classified_as_jobs": total_after_classification - len(request.jobs),
                "top_n_for_llm": len(top_matches)
            }
        )

        self.db.add(run)
        self.db.commit()

        return BatchProcessResponse(
            total_received=total_received,
            total_processed=total_after_classification,
            total_filtered=len(filtered),
            total_matched=len(match_results),
            matches=match_results,
            processing_time_seconds=processing_time,
            stats=run.stats
        )
