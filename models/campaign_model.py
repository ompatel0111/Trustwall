"""
Campaign model — review request campaigns.

Schema:
    _id          : ObjectId
    space_id     : ObjectId
    owner_id     : ObjectId
    name         : str          campaign display name
    message      : str          custom invitation message
    status       : str          'active' | 'paused' | 'completed'
    requests     : list[dict]   each: {name, email, status, sent_at, submitted_at, collection_link}
    created_at   : datetime
    updated_at   : datetime
"""

from datetime import datetime, timezone
from bson import ObjectId
from database import db

campaigns = db.campaigns


def create_campaign(space_id, owner_id, name: str, message: str) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "space_id": ObjectId(space_id) if isinstance(space_id, str) else space_id,
        "owner_id": ObjectId(owner_id) if isinstance(owner_id, str) else owner_id,
        "name": name.strip(),
        "message": message.strip(),
        "status": "active",
        "requests": [],
        "created_at": now,
        "updated_at": now,
    }
    result = campaigns.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def find_campaign_by_id(campaign_id) -> dict | None:
    if isinstance(campaign_id, str):
        campaign_id = ObjectId(campaign_id)
    return campaigns.find_one({"_id": campaign_id})


def find_campaigns_by_space(space_id, owner_id) -> list:
    return list(campaigns.find({
        "space_id": ObjectId(space_id) if isinstance(space_id, str) else space_id,
        "owner_id": ObjectId(owner_id) if isinstance(owner_id, str) else owner_id,
    }).sort("created_at", -1))


def add_request_to_campaign(campaign_id, name: str, email: str, collection_link: str) -> dict:
    req = {
        "_id": str(ObjectId()),
        "name": name.strip(),
        "email": email.lower().strip(),
        "status": "pending",
        "sent_at": None,
        "submitted_at": None,
        "collection_link": collection_link,
    }
    if isinstance(campaign_id, str):
        campaign_id = ObjectId(campaign_id)
    campaigns.update_one(
        {"_id": campaign_id},
        {"$push": {"requests": req}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    return req


def update_request_status(campaign_id, request_id: str, status: str, field: str = None) -> None:
    if isinstance(campaign_id, str):
        campaign_id = ObjectId(campaign_id)
    update = {"$set": {
        "requests.$.status": status,
        "updated_at": datetime.now(timezone.utc),
    }}
    if field:
        update["$set"][f"requests.$.{field}"] = datetime.now(timezone.utc).isoformat()
    campaigns.update_one(
        {"_id": campaign_id, "requests._id": request_id},
        update
    )


def delete_campaign(campaign_id) -> None:
    if isinstance(campaign_id, str):
        campaign_id = ObjectId(campaign_id)
    campaigns.delete_one({"_id": campaign_id})


def serialize_campaign(c: dict) -> dict:
    return {
        "id": str(c["_id"]),
        "space_id": str(c["space_id"]),
        "owner_id": str(c["owner_id"]),
        "name": c["name"],
        "message": c["message"],
        "status": c["status"],
        "requests": c.get("requests", []),
        "created_at": c["created_at"].isoformat(),
        "updated_at": c["updated_at"].isoformat(),
    }
