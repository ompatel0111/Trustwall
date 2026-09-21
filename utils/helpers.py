"""
General helper utilities.
"""

from bson import ObjectId
from datetime import datetime, timezone


def ok(data=None, message="Success"):
    """Standard success response format — returns a plain dict."""
    response = {"success": True, "message": message}
    if data is not None:
        response["data"] = data
    return response


def err(message="Something went wrong"):
    """Standard error response format — returns a plain dict."""
    return {"success": False, "message": message}


def to_object_id(id_string: str) -> ObjectId | None:
    """Safely convert a string to a MongoDB ObjectId. Returns None if invalid."""
    try:
        return ObjectId(id_string)
    except Exception:
        return None


def get_initials(name: str) -> str:
    """
    Generate 1–2 letter initials from a name.
    Used for avatar placeholders since we don't support image uploads.
    Example: "John Doe" → "JD", "Alice" → "A"
    """
    parts = name.strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    elif parts:
        return parts[0][0].upper()
    return "?"
