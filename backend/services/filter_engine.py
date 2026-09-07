"""Filter engine for deterministic filtering."""
from datetime import datetime, timedelta
from typing import List, Optional

from backend.models.schemas import NormalizedOpportunity, SearchConfig, FreshnessOption, UserProfile


class FilterEngine:
    """Deterministic filtering engine."""

    @staticmethod
    def get_freshness_cutoff(freshness: FreshnessOption, custom_hours: Optional[int] = None) -> datetime:
        """
        Get cutoff datetime for freshness filter.

        Args:
            freshness: Freshness option
            custom_hours: Custom hours if freshness is CUSTOM

        Returns:
            Cutoff datetime
        """
        now = datetime.utcnow()

        if freshness == FreshnessOption.HOUR_1:
            return now - timedelta(hours=1)
        elif freshness == FreshnessOption.HOUR_6:
            return now - timedelta(hours=6)
        elif freshness == FreshnessOption.HOUR_12:
            return now - timedelta(hours=12)
        elif freshness == FreshnessOption.HOUR_24:
            return now - timedelta(hours=24)
        elif freshness == FreshnessOption.DAYS_3:
            return now - timedelta(days=3)
        elif freshness == FreshnessOption.DAYS_7:
            return now - timedelta(days=7)
        elif freshness == FreshnessOption.CUSTOM and custom_hours:
            return now - timedelta(hours=custom_hours)
        else:
            return now - timedelta(hours=24)  # Default

    @staticmethod
    def passes_freshness_filter(
        opportunity: NormalizedOpportunity,
        cutoff: datetime,
        min_confidence: float = 0.5
    ) -> bool:
        """
        Check if opportunity passes freshness filter.

        Args:
            opportunity: Normalized opportunity
            cutoff: Cutoff datetime
            min_confidence: Minimum timestamp confidence required

        Returns:
            True if passes filter
        """
        if not opportunity.posted_at:
            # No timestamp - reject by default (can be made configurable)
            return False

        if opportunity.timestamp_confidence < min_confidence:
            # Low confidence timestamp - reject by default
            return False

        return opportunity.posted_at >= cutoff

    @staticmethod
    def passes_location_filter(
        opportunity: NormalizedOpportunity,
        profile: UserProfile,
        search_config: SearchConfig
    ) -> bool:
        """
        Check if opportunity passes location filter.

        Args:
            opportunity: Normalized opportunity
            profile: User profile
            search_config: Search configuration

        Returns:
            True if passes filter
        """
        # Use search config locations if provided, else profile locations
        preferred_locations = search_config.locations or profile.locations

        if not preferred_locations:
            # No location preference - accept all
            return True

        if not opportunity.location:
            # No location info - reject by default
            return False

        opp_location_lower = opportunity.location.lower()

        # Check for matches (case-insensitive substring matching)
        for pref_loc in preferred_locations:
            pref_loc_lower = pref_loc.lower()

            # Exact match or contains
            if pref_loc_lower in opp_location_lower or opp_location_lower in pref_loc_lower:
                return True

            # Special handling for "remote"
            if pref_loc_lower == "remote" and "remote" in opp_location_lower:
                return True

        return False

    @staticmethod
    def passes_experience_filter(
        opportunity: NormalizedOpportunity,
        profile: UserProfile,
        search_config: SearchConfig
    ) -> bool:
        """
        Check if opportunity passes experience filter.

        Args:
            opportunity: Normalized opportunity
            profile: User profile
            search_config: Search configuration

        Returns:
            True if passes filter
        """
        user_exp = profile.experience_years

        # Use search config if provided
        if search_config.experience_min is not None or search_config.experience_max is not None:
            req_min = search_config.experience_min
            req_max = search_config.experience_max
        else:
            req_min = opportunity.experience_min
            req_max = opportunity.experience_max

        # No requirement - accept
        if req_min is None and req_max is None:
            return True

        # Check range
        if req_min is not None and user_exp < req_min:
            # Allow some flexibility (e.g., user has 0.9 years but job requires 1)
            if user_exp < req_min * 0.8:  # 20% tolerance
                return False

        if req_max is not None and user_exp > req_max:
            # Overqualification is usually okay, but can be made stricter
            # For now, only reject if significantly overqualified
            if user_exp > req_max * 1.5:
                return False

        return True

    @staticmethod
    def passes_role_filter(
        opportunity: NormalizedOpportunity,
        profile: UserProfile,
        search_config: SearchConfig
    ) -> bool:
        """
        Check if opportunity passes role filter.

        Args:
            opportunity: Normalized opportunity
            profile: User profile
            search_config: Search configuration

        Returns:
            True if passes filter
        """
        # Use search config roles if provided, else profile roles
        target_roles = search_config.roles or profile.roles

        if not target_roles:
            # No role preference - accept all
            return True

        title_lower = opportunity.title.lower()

        # Check for role matches (case-insensitive substring)
        for role in target_roles:
            role_lower = role.lower()
            if role_lower in title_lower:
                return True

        return False

    @staticmethod
    def passes_employment_filter(
        opportunity: NormalizedOpportunity,
        search_config: SearchConfig
    ) -> bool:
        """
        Check if opportunity passes employment type filter.

        Args:
            opportunity: Normalized opportunity
            search_config: Search configuration

        Returns:
            True if passes filter
        """
        if not search_config.employment_types:
            # No employment type preference - accept all
            return True

        if not opportunity.employment_type:
            # No employment type info - accept by default
            return True

        emp_type_lower = opportunity.employment_type.lower()

        for pref_type in search_config.employment_types:
            if pref_type.lower() in emp_type_lower:
                return True

        return False

    def filter_opportunities(
        self,
        opportunities: List[NormalizedOpportunity],
        profile: UserProfile,
        search_config: SearchConfig
    ) -> List[NormalizedOpportunity]:
        """
        Apply all filters to opportunities.

        Args:
            opportunities: List of normalized opportunities
            profile: User profile
            search_config: Search configuration

        Returns:
            Filtered list of opportunities
        """
        cutoff = self.get_freshness_cutoff(search_config.freshness, search_config.custom_hours)

        filtered = []

        for opp in opportunities:
            # Apply filters in order (fastest first to short-circuit)
            if not self.passes_freshness_filter(opp, cutoff):
                continue

            if not self.passes_location_filter(opp, profile, search_config):
                continue

            if not self.passes_experience_filter(opp, profile, search_config):
                continue

            if not self.passes_role_filter(opp, profile, search_config):
                continue

            if not self.passes_employment_filter(opp, search_config):
                continue

            filtered.append(opp)

        return filtered
