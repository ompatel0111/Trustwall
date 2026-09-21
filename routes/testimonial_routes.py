"""
Testimonial routes — moderation inbox (owner-only actions).

Endpoints:
    GET  /api/testimonials                    — list testimonials (filtered by space, search, rating, tag)
    GET  /api/testimonials/<id>               — get single testimonial
    POST /api/testimonials/<id>/approve       — approve a pending testimonial
    POST /api/testimonials/<id>/reject        — reject a pending testimonial
    POST /api/testimonials/<id>/archive       — archive a testimonial
    POST /api/testimonials/<id>/feature       — toggle featured flag
    POST /api/testimonials/<id>/like          — toggle liked flag
    DELETE /api/testimonials/<id>             — hard delete a testimonial
    POST /api/testimonials/<id>/restore       — restore archived to pending
    POST /api/testimonials/bulk               — bulk approve/reject/archive/delete
"""

from flask import Blueprint, request, jsonify
from bson import ObjectId

from models.testimonial_model import (
    find_testimonial_by_id, find_testimonials_by_space,
    update_testimonial_status, toggle_featured, toggle_liked,
    delete_testimonial, restore_testimonial, bulk_action,
    serialize_testimonial
)
from models.space_model import find_space_by_id
from utils.helpers import ok, err, to_object_id
from middleware.auth_middleware import login_required

testimonial_bp = Blueprint("testimonials", __name__, url_prefix="/api/testimonials")


def _get_testimonial_and_verify_owner(testimonial_id, current_user):
    """
    Helper: find a testimonial and verify the current user owns its space.
    Returns (testimonial, None) on success or (None, error_response) on failure.
    """
    oid = to_object_id(testimonial_id)
    if not oid:
        return None, (jsonify(err("Invalid testimonial ID.")), 400)

    testimonial = find_testimonial_by_id(oid)
    if not testimonial:
        return None, (jsonify(err("Testimonial not found.")), 404)

    # Verify ownership through the space
    space = find_space_by_id(testimonial["space_id"])
    if not space or space["owner_id"] != current_user["_id"]:
        return None, (jsonify(err("You do not have permission to moderate this testimonial.")), 403)

    return testimonial, None


@testimonial_bp.route("", methods=["GET"])
@login_required
def list_testimonials(current_user):
    """
    List testimonials for a space owned by the current user.
    Query params: space_id (required), status, page, per_page, search, rating, tag
    """
    space_id_str = request.args.get("space_id")
    if not space_id_str:
        return jsonify(err("space_id query parameter is required.")), 400

    oid = to_object_id(space_id_str)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    # Verify ownership
    space = find_space_by_id(oid)
    if not space or space["owner_id"] != current_user["_id"]:
        return jsonify(err("Space not found or access denied.")), 403

    status = request.args.get("status", "all")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))

    # Optional filters
    search = request.args.get("search", "").strip() or None
    rating_raw = request.args.get("rating")
    rating = int(rating_raw) if rating_raw and rating_raw.isdigit() else None
    tag = request.args.get("tag", "").strip() or None

    docs, total = find_testimonials_by_space(
        oid, status, page, per_page,
        search=search, rating=rating, tag=tag
    )

    return jsonify(ok({
        "testimonials": [serialize_testimonial(t) for t in docs],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })), 200


@testimonial_bp.route("/<testimonial_id>", methods=["GET"])
@login_required
def get_testimonial(current_user, testimonial_id):
    """Get a single testimonial."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    return jsonify(ok(serialize_testimonial(testimonial))), 200


@testimonial_bp.route("/<testimonial_id>/approve", methods=["POST"])
@login_required
def approve(current_user, testimonial_id):
    """Approve a testimonial — it will appear on the Wall of Love."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    update_testimonial_status(testimonial["_id"], "approved")
    return jsonify(ok(message="Testimonial approved.")), 200


@testimonial_bp.route("/<testimonial_id>/reject", methods=["POST"])
@login_required
def reject(current_user, testimonial_id):
    """Reject a testimonial."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    update_testimonial_status(testimonial["_id"], "rejected")
    return jsonify(ok(message="Testimonial rejected.")), 200


@testimonial_bp.route("/<testimonial_id>/archive", methods=["POST"])
@login_required
def archive(current_user, testimonial_id):
    """Archive a testimonial."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    update_testimonial_status(testimonial["_id"], "archived")
    return jsonify(ok(message="Testimonial archived.")), 200


@testimonial_bp.route("/<testimonial_id>/feature", methods=["POST"])
@login_required
def feature(current_user, testimonial_id):
    """Toggle the featured flag on a testimonial."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    new_value = not testimonial.get("featured", False)
    toggle_featured(testimonial["_id"], new_value)
    msg = "Testimonial featured." if new_value else "Testimonial unfeatured."
    return jsonify(ok(message=msg)), 200


@testimonial_bp.route("/<testimonial_id>/like", methods=["POST"])
@login_required
def like(current_user, testimonial_id):
    """Toggle the liked flag on a testimonial."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    new_value = not testimonial.get("liked", False)
    toggle_liked(testimonial["_id"], new_value)
    msg = "Testimonial liked." if new_value else "Testimonial unliked."
    return jsonify(ok(message=msg)), 200


@testimonial_bp.route("/<testimonial_id>", methods=["DELETE"])
@login_required
def delete(current_user, testimonial_id):
    """Hard-delete a testimonial. Permanent — cannot be undone."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    delete_testimonial(testimonial["_id"])
    return jsonify(ok(message="Testimonial deleted permanently.")), 200


@testimonial_bp.route("/<testimonial_id>/restore", methods=["POST"])
@login_required
def restore(current_user, testimonial_id):
    """Restore an archived testimonial back to 'pending' status."""
    testimonial, error = _get_testimonial_and_verify_owner(testimonial_id, current_user)
    if error:
        return error
    restore_testimonial(testimonial["_id"])
    return jsonify(ok(message="Testimonial restored to pending.")), 200


@testimonial_bp.route("/bulk", methods=["POST"])
@login_required
def bulk(current_user):
    """
    Apply a bulk action to multiple testimonials.
    Body: {"ids": ["id1", "id2", ...], "action": "approve"|"reject"|"archive"|"delete"}
    All testimonials must belong to a space owned by the current user.
    """
    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    ids = data.get("ids", [])
    action = data.get("action", "").strip()

    if not ids or not isinstance(ids, list):
        return jsonify(err("ids must be a non-empty list.")), 400

    valid_actions = {"approve", "reject", "archive", "delete"}
    if action not in valid_actions:
        return jsonify(err(f"action must be one of: {', '.join(valid_actions)}.")), 400

    # Verify ownership of every testimonial before proceeding
    authorized_ids = []
    for tid in ids:
        oid = to_object_id(tid)
        if not oid:
            continue
        t = find_testimonial_by_id(oid)
        if not t:
            continue
        space = find_space_by_id(t["space_id"])
        if space and space["owner_id"] == current_user["_id"]:
            authorized_ids.append(tid)

    if not authorized_ids:
        return jsonify(err("No authorized testimonials found in the provided IDs.")), 403

    bulk_action(authorized_ids, action)
    return jsonify(ok(
        data={"processed": len(authorized_ids)},
        message=f"Bulk action '{action}' applied to {len(authorized_ids)} testimonial(s)."
    )), 200
