"""Utilities for normalizing LinkedIn data."""
import re
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Tuple
from dateutil import parser as date_parser


def parse_linkedin_timestamp(posted_text: str, reference_time: Optional[datetime] = None) -> Tuple[Optional[datetime], float]:
    """
    Parse LinkedIn posting time text into datetime.

    Args:
        posted_text: Text like "4 hours ago", "1 day ago", "Just now"
        reference_time: Reference time for calculation (defaults to now)

    Returns:
        Tuple of (parsed_datetime, confidence_score)
        confidence_score: 0.0 to 1.0, where 1.0 is exact timestamp
    """
    if not posted_text:
        return None, 0.0

    if reference_time is None:
        reference_time = datetime.utcnow()

    text = posted_text.lower().strip()

    # Just now / moments ago
    if any(keyword in text for keyword in ["just now", "moments ago", "now"]):
        return reference_time, 0.95

    # Extract number and unit
    # Patterns: "4 hours ago", "1 day ago", "3 weeks ago"
    pattern = r'(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago'
    match = re.search(pattern, text)

    if not match:
        # Try without "ago": "4 hours", "1 day"
        pattern = r'(\d+)\s*(minute|hour|day|week|month|year)s?'
        match = re.search(pattern, text)

    if match:
        number = int(match.group(1))
        unit = match.group(2)

        # Calculate time delta
        if unit.startswith('minute'):
            delta = timedelta(minutes=number)
            confidence = 0.98
        elif unit.startswith('hour'):
            delta = timedelta(hours=number)
            confidence = 0.95
        elif unit.startswith('day'):
            delta = timedelta(days=number)
            confidence = 0.90
        elif unit.startswith('week'):
            delta = timedelta(weeks=number)
            confidence = 0.85
        elif unit.startswith('month'):
            delta = timedelta(days=number * 30)  # Approximate
            confidence = 0.70
        elif unit.startswith('year'):
            delta = timedelta(days=number * 365)  # Approximate
            confidence = 0.60
        else:
            return None, 0.0

        parsed_time = reference_time - delta
        return parsed_time, confidence

    # Try parsing as absolute date (less common on LinkedIn)
    try:
        parsed_time = date_parser.parse(text, fuzzy=True)
        return parsed_time, 0.99
    except:
        pass

    return None, 0.0


def parse_experience_requirement(experience_text: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Parse experience requirement text.

    Args:
        experience_text: Text like "1-3 years", "2+ years", "Entry level"

    Returns:
        Tuple of (min_years, max_years)
    """
    if not experience_text:
        return None, None

    text = experience_text.lower().strip()

    # Entry level
    if any(keyword in text for keyword in ["entry level", "entry-level", "no experience"]):
        return 0, 1

    # Intern
    if "intern" in text:
        return 0, 0.5

    # Mid level
    if "mid level" in text or "mid-level" in text:
        return 3, 6

    # Senior
    if "senior" in text:
        return 5, None

    # Extract numbers
    # Pattern: "1-3 years", "2 to 5 years"
    range_pattern = r'(\d+(?:\.\d+)?)\s*[-to]+\s*(\d+(?:\.\d+)?)'
    match = re.search(range_pattern, text)

    if match:
        min_exp = float(match.group(1))
        max_exp = float(match.group(2))
        return min_exp, max_exp

    # Pattern: "3+ years", "5 or more years"
    plus_pattern = r'(\d+(?:\.\d+)?)\s*\+|(\d+(?:\.\d+)?)\s*or\s+more'
    match = re.search(plus_pattern, text)

    if match:
        min_exp = float(match.group(1) or match.group(2))
        return min_exp, None

    # Single number: "3 years"
    single_pattern = r'(\d+(?:\.\d+)?)'
    match = re.search(single_pattern, text)

    if match:
        years = float(match.group(1))
        return years, years

    return None, None


def generate_fingerprint(title: str, company: str, location: Optional[str], url: str) -> str:
    """
    Generate unique fingerprint for deduplication.

    Args:
        title: Job title
        company: Company name
        location: Location string
        url: Job URL

    Returns:
        SHA256 hash as hex string (first 16 chars)
    """
    # Normalize inputs
    normalized = [
        title.lower().strip(),
        company.lower().strip(),
        (location or "").lower().strip(),
        url.strip()
    ]

    # Create hash
    combined = "|".join(normalized)
    hash_obj = hashlib.sha256(combined.encode('utf-8'))
    return hash_obj.hexdigest()[:16]


def extract_linkedin_id(url: str) -> Optional[str]:
    """
    Extract LinkedIn job ID from URL.

    Args:
        url: LinkedIn job URL

    Returns:
        Job ID or None
    """
    if not url:
        return None

    # Pattern: /jobs/view/123456789/ or /jobs/view/123456789
    pattern = r'/jobs/view/(\d+)'
    match = re.search(pattern, url)

    if match:
        return match.group(1)

    # Pattern for post: /posts/username_activity-123456789-abcd
    pattern = r'/posts/[^/]+-(\d+)'
    match = re.search(pattern, url)

    if match:
        return match.group(1)

    return None


def normalize_location(location: str) -> str:
    """
    Normalize location string.

    Args:
        location: Raw location string

    Returns:
        Normalized location
    """
    if not location:
        return ""

    # Remove extra whitespace
    normalized = " ".join(location.split())

    # Common replacements
    normalized = normalized.replace("(Remote)", "Remote")
    normalized = normalized.replace("(Hybrid)", "Hybrid")

    return normalized.strip()
