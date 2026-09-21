"""
Validation utilities.

These functions validate user input on the backend.
Never trust frontend validation alone — always re-validate on the server.
"""

import re


def is_valid_email(email: str) -> bool:
    """Basic email format check."""
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email.strip()))


def is_valid_password(password: str) -> tuple[bool, str]:
    """
    Password must be at least 8 characters.
    Returns (is_valid, error_message).
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters."
    return True, ""


def is_valid_name(name: str) -> bool:
    """Name must be between 1 and 100 characters."""
    return 1 <= len(name.strip()) <= 100


def is_valid_slug(slug: str) -> tuple[bool, str]:
    """
    Slug must be lowercase letters, numbers, and hyphens only.
    Length: 3–50 characters.
    """
    slug = slug.strip()
    if len(slug) < 3 or len(slug) > 50:
        return False, "Slug must be between 3 and 50 characters."
    if not re.match(r'^[a-z0-9\-]+$', slug):
        return False, "Slug can only contain lowercase letters, numbers, and hyphens."
    return True, ""


def is_valid_rating(rating) -> bool:
    """Rating must be an integer between 1 and 5."""
    try:
        r = int(rating)
        return 1 <= r <= 5
    except (TypeError, ValueError):
        return False


def is_valid_review(review: str) -> tuple[bool, str]:
    """Review must be between 10 and 2000 characters."""
    review = review.strip()
    if len(review) < 10:
        return False, "Review must be at least 10 characters."
    if len(review) > 2000:
        return False, "Review must be under 2000 characters."
    return True, ""


def slugify(text: str) -> str:
    """Convert a display name into a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s\-]', '', text)   # remove special characters
    text = re.sub(r'[\s]+', '-', text)             # spaces → hyphens
    text = re.sub(r'-+', '-', text)                # collapse multiple hyphens
    return text.strip('-')
