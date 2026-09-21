"""
Space model — helper functions for the spaces MongoDB collection.

A Space is a branded testimonial collection page that an owner creates.
Each space has a unique slug that forms the public collection URL:
    /collect/<slug>

Schema:
    _id                    : ObjectId
    owner_id               : ObjectId   (references users._id)
    name                   : str        (display name, e.g. "Acme Corp")
    slug                   : str        (URL-safe, unique, e.g. "acme-corp")
    description            : str
    prompt                 : str        (question shown on the collection form)
    enable_rating          : bool
    require_avatar         : bool       (not used since no image upload)
    custom_questions       : list[str]  (extra questions shown on the form)
    wall_settings          : dict       (Wall of Love display settings)
    auto_approve_high_rating : bool     (auto-approve testimonials rated >= 4)
    auto_feature_top_rating  : bool     (auto-feature testimonials rated 5)
    created_at             : datetime
    updated_at             : datetime
"""

from datetime import datetime, timezone
from bson import ObjectId
from database import db

spaces = db.spaces

# Default Wall of Love display settings
DEFAULT_WALL_SETTINGS = {
    "wall_title": "Wall of Love",
    "wall_subtitle": "",
    "show_name": True,
    "show_role": True,
    "show_rating": True,
    "show_date": True,
    "show_tags": True,
    "layout": "grid",
    "per_page": 12,
    "sort_by": "newest",
    "accent_color": "#7C3AED",
    "bg_color": "#F5F3FF",
}


def create_space(owner_id, name: str, slug: str, description: str = "",
                 prompt: str = "How was your experience?",
                 enable_rating: bool = True,
                 custom_questions: list = None) -> dict:
    """Insert a new space document."""
    now = datetime.now(timezone.utc)
    space = {
        "owner_id": owner_id,
        "name": name,
        "slug": slug.lower().strip(),
        "description": description,
        "prompt": prompt,
        "enable_rating": enable_rating,
        "require_avatar": False,
        "custom_questions": custom_questions or [],
        "wall_settings": dict(DEFAULT_WALL_SETTINGS),
        "auto_approve_high_rating": False,
        "auto_feature_top_rating": False,
        "created_at": now,
        "updated_at": now,
    }
    result = spaces.insert_one(space)
    space["_id"] = result.inserted_id
    return space


def find_space_by_id(space_id) -> dict | None:
    """Find a space by its ObjectId."""
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)
    return spaces.find_one({"_id": space_id})


def find_space_by_slug(slug: str) -> dict | None:
    """Find a space by its public slug."""
    return spaces.find_one({"slug": slug.lower().strip()})


def find_spaces_by_owner(owner_id) -> list:
    """Return all spaces owned by a user, newest first."""
    return list(spaces.find({"owner_id": owner_id}).sort("created_at", -1))


def update_space(space_id, updates: dict) -> None:
    """Update a space's fields."""
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)
    updates["updated_at"] = datetime.now(timezone.utc)
    spaces.update_one({"_id": space_id}, {"$set": updates})


def delete_space(space_id) -> None:
    """Delete a space document."""
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)
    spaces.delete_one({"_id": space_id})


def slug_exists(slug: str) -> bool:
    """Check whether a slug is already taken."""
    return spaces.find_one({"slug": slug.lower().strip()}) is not None


def serialize_space(space: dict) -> dict:
    """Convert a space document to a JSON-safe dict."""
    return {
        "id": str(space["_id"]),
        "owner_id": str(space["owner_id"]),
        "name": space["name"],
        "slug": space["slug"],
        "description": space.get("description", ""),
        "prompt": space.get("prompt", "How was your experience?"),
        "enable_rating": space.get("enable_rating", True),
        "custom_questions": space.get("custom_questions", []),
        "wall_settings": space.get("wall_settings", dict(DEFAULT_WALL_SETTINGS)),
        "auto_approve_high_rating": space.get("auto_approve_high_rating", False),
        "auto_feature_top_rating": space.get("auto_feature_top_rating", False),
        "created_at": space["created_at"].isoformat(),
        "updated_at": space["updated_at"].isoformat(),
    }
