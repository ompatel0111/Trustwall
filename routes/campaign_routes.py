"""
Campaign routes — review request campaign management.

All routes require authentication (owner only).

Endpoints:
    POST   /api/campaigns                   — create a new campaign
    GET    /api/campaigns?space_id=...      — list campaigns for a space
    GET    /api/campaigns/<id>              — get a single campaign
    DELETE /api/campaigns/<id>              — delete a campaign
    POST   /api/campaigns/<id>/requests     — add customer request(s) to a campaign
    POST   /api/campaigns/<id>/send         — "send" pending requests (dev fallback)
"""

from flask import Blueprint, request, jsonify

from models.campaign_model import (
    create_campaign, find_campaign_by_id, find_campaigns_by_space,
    add_request_to_campaign, update_request_status,
    delete_campaign, serialize_campaign
)
from models.space_model import find_space_by_id
from utils.helpers import ok, err, to_object_id
from utils.email_service import send_campaign_request
from middleware.auth_middleware import login_required

campaign_bp = Blueprint("campaigns", __name__, url_prefix="/api/campaigns")


def _get_campaign_and_verify_owner(campaign_id, current_user):
    """
    Helper: find a campaign and verify the current user owns its space.
    Returns (campaign, space, None) on success or (None, None, error_response) on failure.
    """
    oid = to_object_id(campaign_id)
    if not oid:
        return None, None, (jsonify(err("Invalid campaign ID.")), 400)

    campaign = find_campaign_by_id(oid)
    if not campaign:
        return None, None, (jsonify(err("Campaign not found.")), 404)

    space = find_space_by_id(campaign["space_id"])
    if not space or space["owner_id"] != current_user["_id"]:
        return None, None, (jsonify(err("You do not have permission to access this campaign.")), 403)

    return campaign, space, None


@campaign_bp.route("", methods=["POST"])
@login_required
def create(current_user):
    """
    Create a new review request campaign for a space.
    Body: {"space_id": "...", "name": "...", "message": "..."}
    """
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify(err("Request body is required.")), 400

    space_id_str = data.get("space_id", "").strip()
    name = data.get("name", "").strip()
    message = data.get("message", "").strip()

    if not space_id_str:
        return jsonify(err("space_id is required.")), 400
    if not name:
        return jsonify(err("Campaign name is required.")), 400

    oid = to_object_id(space_id_str)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to create campaigns for this space.")), 403

    if not message:
        message = f"We would love to hear your feedback on {space['name']}!"

    campaign = create_campaign(oid, current_user["_id"], name, message)
    return jsonify(ok(serialize_campaign(campaign), "Campaign created successfully.")), 201


@campaign_bp.route("", methods=["GET"])
@login_required
def list_campaigns(current_user):
    """
    List all campaigns for a space owned by the current user.
    Query param: space_id (required)
    """
    space_id_str = request.args.get("space_id", "").strip()
    if not space_id_str:
        return jsonify(err("space_id query parameter is required.")), 400

    oid = to_object_id(space_id_str)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space or space["owner_id"] != current_user["_id"]:
        return jsonify(err("Space not found or access denied.")), 403

    campaigns = find_campaigns_by_space(oid, current_user["_id"])
    return jsonify(ok([serialize_campaign(c) for c in campaigns])), 200


@campaign_bp.route("/<campaign_id>", methods=["GET"])
@login_required
def get_campaign(current_user, campaign_id):
    """Get a single campaign."""
    campaign, space, error = _get_campaign_and_verify_owner(campaign_id, current_user)
    if error:
        return error
    return jsonify(ok(serialize_campaign(campaign))), 200


@campaign_bp.route("/<campaign_id>", methods=["DELETE"])
@login_required
def delete(current_user, campaign_id):
    """Delete a campaign permanently."""
    campaign, space, error = _get_campaign_and_verify_owner(campaign_id, current_user)
    if error:
        return error
    delete_campaign(campaign["_id"])
    return jsonify(ok(message="Campaign deleted.")), 200


@campaign_bp.route("/<campaign_id>/requests", methods=["POST"])
@login_required
def add_requests(current_user, campaign_id):
    """
    Add one or more customer requests to a campaign.
    Body: {"requests": [{"name": "...", "email": "..."}, ...]} OR {"name": "...", "email": "..."} OR list of objects
    Each request gets a unique collection link.
    """
    campaign, space, error = _get_campaign_and_verify_owner(campaign_id, current_user)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    raw_requests = []
    if isinstance(data, list):
        raw_requests = data
    elif isinstance(data, dict):
        if "requests" in data and isinstance(data["requests"], list):
            raw_requests = data["requests"]
        elif "name" in data and "email" in data:
            raw_requests = [data]

    if not raw_requests:
        return jsonify(err("requests must be a non-empty list.")), 400

    added = []
    for item in raw_requests:
        name = item.get("name", "").strip()
        email = item.get("email", "").strip()
        if not name or not email:
            continue  # Skip malformed entries silently

        req = add_request_to_campaign(
            campaign["_id"],
            name=name,
            email=email,
            collection_link=f"http://localhost:5000/collect.html?space={space['slug']}",
        )

        from models.campaign_model import campaigns as campaigns_col
        real_link = f"http://localhost:5000/collect.html?space={space['slug']}&ref={req['_id']}"
        campaigns_col.update_one(
            {"_id": campaign["_id"], "requests._id": req["_id"]},
            {"$set": {"requests.$.collection_link": real_link}}
        )
        req["collection_link"] = real_link
        added.append(req)

    return jsonify(ok(
        data={"added": len(added), "requests": added},
        message=f"{len(added)} request(s) added to campaign."
    )), 201


@campaign_bp.route("/<campaign_id>/send", methods=["POST"])
@login_required
def send_requests(current_user, campaign_id):
    """
    "Send" all pending requests in a campaign.
    In dev mode: marks each as 'sent', sets sent_at, and prints/returns the collection links.
    Body: optional {"request_ids": [...]} — if omitted, sends ALL pending requests.
    """
    campaign, space, error = _get_campaign_and_verify_owner(campaign_id, current_user)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    filter_ids = data.get("request_ids")  # Optional list of specific request _ids to send

    pending = [
        r for r in campaign.get("requests", [])
        if r.get("status") == "pending"
        and (filter_ids is None or r["_id"] in filter_ids)
    ]

    if not pending:
        return jsonify(ok(
            data={"sent": 0, "dev_results": []},
            message="No pending requests to send."
        )), 200

    dev_results = []
    for req in pending:
        # Mark request as sent
        update_request_status(campaign["_id"], req["_id"], "sent", field="sent_at")

        # Emit the email (SMTP or dev mode)
        result = send_campaign_request(
            to_email=req["email"],
            to_name=req["name"],
            from_name=current_user["name"],
            message=campaign.get("message", ""),
            collection_link=req.get("collection_link", f"http://localhost:5000/collect.html?space={space['slug']}"),
        )
        dev_results.append({
            "request_id": req["_id"],
            "name": req["name"],
            "email": req["email"],
            "collection_link": req.get("collection_link", ""),
            "dev_result": result,
        })

    return jsonify(ok(
        data={"sent": len(dev_results), "dev_results": dev_results},
        message=f"{len(dev_results)} request(s) sent."
    )), 200
