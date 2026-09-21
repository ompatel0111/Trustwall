"""
Analytics routes — statistics for a space.

Endpoints:
    GET /api/spaces/<id>/analytics — rating distribution, totals, time-series, tags

Query params:
    days : int — filter to last N days (7, 30, 90, 365). Omit for all time.
"""

from flask import Blueprint, request, jsonify
from models.space_model import find_space_by_id
from models.testimonial_model import get_analytics
from models.campaign_model import find_campaigns_by_space
from utils.helpers import ok, err, to_object_id
from middleware.auth_middleware import login_required

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/spaces")


@analytics_bp.route("/<space_id>/analytics", methods=["GET"])
@login_required
def get_space_analytics(current_user, space_id):
    """
    Return analytics for a space.
    Only the owner can access their space's analytics.

    Query params:
        days — optional integer, restricts data to the last N days (e.g. 7, 30, 90, 365).
               Omit or leave blank for all-time stats.
    """
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("Access denied.")), 403

    # Parse optional days filter
    days_raw = request.args.get("days")
    days = None
    if days_raw:
        try:
            days = int(days_raw)
            if days <= 0:
                days = None
        except ValueError:
            days = None

    # Fetch rich testimonial analytics
    stats = get_analytics(oid, days=days)

    # ── Campaign metrics ───────────────────────────────────────────────────────
    # Count total campaign requests and compute conversion rate
    campaigns = find_campaigns_by_space(oid, current_user["_id"])
    total_requests = len(campaigns)

    total_sent = 0
    total_submitted = 0
    for campaign in campaigns:
        for req in campaign.get("requests", []):
            if req.get("status") in ("sent", "submitted"):
                total_sent += 1
            if req.get("status") == "submitted":
                total_submitted += 1

    conversion_rate = round((total_submitted / total_sent) * 100, 1) if total_sent > 0 else 0.0

    # Merge campaign stats into the response
    stats["total_requests"] = total_requests
    stats["total_sent"] = total_sent
    stats["total_submitted"] = total_submitted
    stats["conversion_rate"] = conversion_rate
    stats["days_filter"] = days  # Echo the applied filter back to the client

    return jsonify(ok(stats)), 200
