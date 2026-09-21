"""
Refresh Token model — stores hashed refresh tokens in MongoDB.

Why we store tokens:
  - So we can invalidate (revoke) a specific token on logout.
  - Enables refresh token rotation: when a refresh token is used,
    the old one is revoked and a brand new one is issued.

Schema:
    _id        : ObjectId
    user_id    : ObjectId  (references users._id)
    token_hash : str       (bcrypt hash of the actual token)
    expires_at : datetime
    revoked    : bool      (True means this token can no longer be used)
    created_at : datetime
"""

import bcrypt
from datetime import datetime, timezone
from database import db

refresh_tokens = db.refresh_tokens


def store_refresh_token(user_id, raw_token: str, expires_at: datetime) -> None:
    """Hash and store a new refresh token."""
    token_hash = bcrypt.hashpw(raw_token.encode(), bcrypt.gensalt()).decode()
    refresh_tokens.insert_one({
        "user_id": user_id,
        "token_hash": token_hash,
        "expires_at": expires_at,
        "revoked": False,
        "created_at": datetime.now(timezone.utc),
    })


def find_valid_token(user_id, raw_token: str) -> dict | None:
    """
    Find a non-revoked, non-expired token for this user that matches raw_token.
    We must check every stored token because we hash them (can't query directly).
    """
    now = datetime.now(timezone.utc)
    candidates = refresh_tokens.find({
        "user_id": user_id,
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    for record in candidates:
        if bcrypt.checkpw(raw_token.encode(), record["token_hash"].encode()):
            return record
    return None


def revoke_token(token_id) -> None:
    """Mark a refresh token as revoked so it can't be used again."""
    refresh_tokens.update_one(
        {"_id": token_id},
        {"$set": {"revoked": True}}
    )


def revoke_all_tokens_for_user(user_id) -> None:
    """Revoke every refresh token for a user — used on logout or password change."""
    refresh_tokens.update_many(
        {"user_id": user_id},
        {"$set": {"revoked": True}}
    )
