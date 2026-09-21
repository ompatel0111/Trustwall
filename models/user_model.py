"""
User model — helper functions for the users MongoDB collection.

Schema:
    _id                  : ObjectId  (auto-generated)
    name                 : str
    email                : str       (unique, lowercase)
    password_hash        : str       (bcrypt, never returned to client)
    email_verified       : bool      (must be True before login allowed)
    verification_token   : str|None  (URL-safe token, set on signup)
    verification_expiry  : float|None (Unix timestamp, 24h window)
    reset_token          : str|None
    reset_token_expiry   : float|None
    created_at           : datetime
    updated_at           : datetime
"""

from datetime import datetime, timezone
from database import db

# The MongoDB collection we operate on
users = db.users


def create_user(name: str, email: str, password_hash: str,
                verification_token: str = None, verification_expiry: float = None) -> dict:
    """Insert a new user document and return it."""
    now = datetime.now(timezone.utc)
    user = {
        "name": name,
        "email": email.lower().strip(),
        "password_hash": password_hash,
        "email_verified": False,
        "verification_token": verification_token,
        "verification_expiry": verification_expiry,
        "reset_token": None,
        "reset_token_expiry": None,
        "created_at": now,
        "updated_at": now,
    }
    result = users.insert_one(user)
    user["_id"] = result.inserted_id
    return user


def find_user_by_email(email: str) -> dict | None:
    """Look up a user by email address (case-insensitive)."""
    return users.find_one({"email": email.lower().strip()})


def find_user_by_id(user_id) -> dict | None:
    """Look up a user by their MongoDB ObjectId."""
    return users.find_one({"_id": user_id})


def find_user_by_verification_token(token: str) -> dict | None:
    """Look up a user by their email verification token."""
    return users.find_one({"verification_token": token})


def update_user(user_id, updates: dict) -> None:
    """Update arbitrary fields on a user document."""
    updates["updated_at"] = datetime.now(timezone.utc)
    users.update_one({"_id": user_id}, {"$set": updates})


def safe_user(user: dict) -> dict:
    """
    Return a copy of the user document that is safe to send to the client.
    Removes password_hash and converts ObjectId to string.
    """
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "email_verified": user.get("email_verified", False),
        "created_at": user["created_at"].isoformat(),
    }
