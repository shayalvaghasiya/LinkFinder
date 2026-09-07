"""Test utilities for normalization functions."""
import pytest
from datetime import datetime, timedelta
from backend.utils.normalization import (
    parse_linkedin_timestamp,
    parse_experience_requirement,
    generate_fingerprint,
    extract_linkedin_id,
    normalize_location
)


def test_parse_linkedin_timestamp():
    """Test timestamp parsing."""
    reference = datetime(2026, 9, 7, 12, 0, 0)

    # Test "just now"
    result, confidence = parse_linkedin_timestamp("Just now", reference)
    assert result is not None
    assert confidence > 0.9

    # Test hours ago
    result, confidence = parse_linkedin_timestamp("4 hours ago", reference)
    assert result == reference - timedelta(hours=4)
    assert confidence > 0.9

    # Test days ago
    result, confidence = parse_linkedin_timestamp("2 days ago", reference)
    assert result == reference - timedelta(days=2)
    assert confidence > 0.85

    # Test invalid
    result, confidence = parse_linkedin_timestamp("invalid", reference)
    assert result is None
    assert confidence == 0.0


def test_parse_experience_requirement():
    """Test experience parsing."""
    # Test range
    min_exp, max_exp = parse_experience_requirement("1-3 years")
    assert min_exp == 1
    assert max_exp == 3

    # Test plus
    min_exp, max_exp = parse_experience_requirement("5+ years")
    assert min_exp == 5
    assert max_exp is None

    # Test entry level
    min_exp, max_exp = parse_experience_requirement("Entry level")
    assert min_exp == 0
    assert max_exp == 1

    # Test senior
    min_exp, max_exp = parse_experience_requirement("Senior")
    assert min_exp == 5
    assert max_exp is None


def test_generate_fingerprint():
    """Test fingerprint generation."""
    fp1 = generate_fingerprint("DevOps Engineer", "ABC Corp", "Remote", "https://example.com/job/1")
    fp2 = generate_fingerprint("DevOps Engineer", "ABC Corp", "Remote", "https://example.com/job/1")
    fp3 = generate_fingerprint("SRE", "ABC Corp", "Remote", "https://example.com/job/1")

    # Same inputs should generate same fingerprint
    assert fp1 == fp2

    # Different inputs should generate different fingerprints
    assert fp1 != fp3

    # Fingerprint should be 16 chars
    assert len(fp1) == 16


def test_extract_linkedin_id():
    """Test LinkedIn ID extraction."""
    # Test job URL
    url = "https://www.linkedin.com/jobs/view/3876543210"
    job_id = extract_linkedin_id(url)
    assert job_id == "3876543210"

    # Test post URL
    url = "https://www.linkedin.com/posts/username_activity-1234567890-abcd"
    post_id = extract_linkedin_id(url)
    assert post_id == "1234567890"

    # Test invalid URL
    url = "https://www.example.com"
    result = extract_linkedin_id(url)
    assert result is None


def test_normalize_location():
    """Test location normalization."""
    assert normalize_location("  Ahmedabad  (Remote)  ") == "Ahmedabad Remote"
    assert normalize_location("Bangalore (Hybrid)") == "Bangalore Hybrid"
    assert normalize_location("") == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
