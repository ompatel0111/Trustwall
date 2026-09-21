"""
Team model — space team members.

Schema:
    _id            : ObjectId
    space_id       : ObjectId
    owner_id       : ObjectId   (who sent the invite)
    invitee_email  : str
    invitee_name   : str
    role           : str        'admin' | 'viewer'
    status         : str        'pending' | 'active'
    invite_token   : str
    invited_at     : datetime
    joined_at      : datetime | None
"""

from datetime import datetime, timezone
from bson import ObjectId
from database import db

team_members = db.team_members


def invite_member(space_id, owner_id, email: str, name: str, role: str, invite_token: str) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "space_id": ObjectId(space_id) if isinstance(space_id, str) else space_id,
        "owner_id": ObjectId(owner_id) if isinstance(owner_id, str) else owner_id,
        "invitee_email": email.lower().strip(),
        "invitee_name": name.strip(),
        "role": role,
        "status": "pending",
        "invite_token": invite_token,
        "invited_at": now,
        "joined_at": None,
    }
    result = team_members.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def find_member_by_id(member_id) -> dict | None:
    if isinstance(member_id, str):
        member_id = ObjectId(member_id)
    return team_members.find_one({"_id": member_id})


def find_members_by_space(space_id) -> list:
    return list(team_members.find({
        "space_id": ObjectId(space_id) if isinstance(space_id, str) else space_id
    }).sort("invited_at", -1))


def find_member_by_token(token: str) -> dict | None:
    return team_members.find_one({"invite_token": token})


def accept_invite(member_id) -> None:
    if isinstance(member_id, str):
        member_id = ObjectId(member_id)
    team_members.update_one(
        {"_id": member_id},
        {"$set": {"status": "active", "joined_at": datetime.now(timezone.utc)}}
    )


def remove_member(member_id) -> None:
    if isinstance(member_id, str):
        member_id = ObjectId(member_id)
    team_members.delete_one({"_id": member_id})


def update_member_role(member_id, role: str) -> None:
    if isinstance(member_id, str):
        member_id = ObjectId(member_id)
    team_members.update_one({"_id": member_id}, {"$set": {"role": role}})


def serialize_member(m: dict) -> dict:
    return {
        "id": str(m["_id"]),
        "space_id": str(m["space_id"]),
        "email": m["invitee_email"],
        "name": m["invitee_name"],
        "role": m["role"],
        "status": m["status"],
        "invited_at": m["invited_at"].isoformat(),
        "joined_at": m["joined_at"].isoformat() if m.get("joined_at") else None,
    }
