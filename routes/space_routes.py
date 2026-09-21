"""
Space routes — CRUD operations for Spaces.

All routes require authentication (owner only).

Endpoints:
    POST   /api/spaces                          — create a new space
    GET    /api/spaces                          — list all spaces owned by current user
    GET    /api/spaces/<id>                     — get a single space
    PUT    /api/spaces/<id>                     — update space settings
    DELETE /api/spaces/<id>                     — delete a space and all its testimonials
    GET    /api/spaces/<id>/wall-settings       — get Wall of Love display settings
    PUT    /api/spaces/<id>/wall-settings       — update Wall of Love display settings
    GET    /api/spaces/<id>/team                — list team members for a space
    POST   /api/spaces/<id>/team                — invite a team member
    PUT    /api/spaces/<id>/team/<member_id>    — update a team member's role
    DELETE /api/spaces/<id>/team/<member_id>    — remove a team member
"""

import secrets
from flask import Blueprint, request, jsonify
from bson import ObjectId

from models.space_model import (
    create_space, find_space_by_id, find_spaces_by_owner,
    update_space, delete_space, slug_exists, serialize_space,
    DEFAULT_WALL_SETTINGS
)
from models.testimonial_model import testimonials as testimonials_col
from models.team_model import (
    invite_member, find_members_by_space, find_member_by_id,
    remove_member, update_member_role, serialize_member
)
from utils.validation import is_valid_slug, slugify
from utils.helpers import ok, err, to_object_id
from utils.email_service import send_team_invite
from middleware.auth_middleware import login_required

space_bp = Blueprint("spaces", __name__, url_prefix="/api/spaces")


@space_bp.route("", methods=["POST"])
@login_required
def create(current_user):
    """Create a new Space. The slug must be unique across the platform."""
    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    name = data.get("name", "").strip()
    if not name:
        return jsonify(err("Space name is required.")), 400

    # Auto-generate slug from name if not provided
    slug = data.get("slug", "").strip() or slugify(name)

    valid_slug, slug_msg = is_valid_slug(slug)
    if not valid_slug:
        return jsonify(err(slug_msg)), 400

    if slug_exists(slug):
        return jsonify(err("This slug is already taken. Please choose another.")), 409

    space = create_space(
        owner_id=current_user["_id"],
        name=name,
        slug=slug,
        description=data.get("description", ""),
        prompt=data.get("prompt", "How was your experience?"),
        enable_rating=data.get("enable_rating", True),
        custom_questions=data.get("custom_questions", []),
    )

    return jsonify(ok(serialize_space(space), "Space created successfully.")), 201


@space_bp.route("", methods=["GET"])
@login_required
def list_spaces(current_user):
    """Return all spaces owned by the current user."""
    all_spaces = find_spaces_by_owner(current_user["_id"])
    return jsonify(ok([serialize_space(s) for s in all_spaces])), 200


@space_bp.route("/<space_id>", methods=["GET"])
@login_required
def get_space(current_user, space_id):
    """Get a single space. Only the owner can access it."""
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    # Authorization check — only the owner can view their space settings
    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to view this space.")), 403

    return jsonify(ok(serialize_space(space))), 200


@space_bp.route("/<space_id>", methods=["PUT"])
@login_required
def update(current_user, space_id):
    """Update space settings. Only the owner can update."""
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to update this space.")), 403

    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    allowed_fields = [
        "name", "description", "prompt", "enable_rating", "custom_questions",
        "auto_approve_high_rating", "auto_feature_top_rating",
    ]
    updates = {k: data[k] for k in allowed_fields if k in data}

    # Validate slug separately if being changed
    if "slug" in data:
        new_slug = data["slug"].strip()
        valid_slug, slug_msg = is_valid_slug(new_slug)
        if not valid_slug:
            return jsonify(err(slug_msg)), 400
        if new_slug != space["slug"] and slug_exists(new_slug):
            return jsonify(err("This slug is already taken.")), 409
        updates["slug"] = new_slug

    if not updates:
        return jsonify(err("Nothing to update.")), 400

    update_space(oid, updates)
    updated_space = find_space_by_id(oid)
    return jsonify(ok(serialize_space(updated_space), "Space updated successfully.")), 200


@space_bp.route("/<space_id>", methods=["DELETE"])
@login_required
def delete(current_user, space_id):
    """Delete a space and all its testimonials."""
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to delete this space.")), 403

    # Delete all testimonials belonging to this space first
    testimonials_col.delete_many({"space_id": oid})
    delete_space(oid)

    return jsonify(ok(message="Space deleted successfully.")), 200


# ── Wall of Love settings ──────────────────────────────────────────────────────

@space_bp.route("/<space_id>/wall-settings", methods=["GET"])
@login_required
def get_wall_settings(current_user, space_id):
    """Return the Wall of Love display settings for a space."""
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to view this space.")), 403

    settings = space.get("wall_settings", dict(DEFAULT_WALL_SETTINGS))
    return jsonify(ok(settings)), 200


@space_bp.route("/<space_id>/wall-settings", methods=["PUT"])
@login_required
def update_wall_settings(current_user, space_id):
    """
    Update the Wall of Love display settings for a space.
    Only recognized keys are saved; extra keys are ignored.
    """
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to update this space.")), 403

    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    # Merge incoming values over defaults; only allow known keys
    allowed_keys = set(DEFAULT_WALL_SETTINGS.keys())
    current_settings = space.get("wall_settings", dict(DEFAULT_WALL_SETTINGS))
    new_settings = {**current_settings, **{k: v for k, v in data.items() if k in allowed_keys}}

    update_space(oid, {"wall_settings": new_settings})
    return jsonify(ok(new_settings, "Wall settings updated.")), 200


# ── Team management ────────────────────────────────────────────────────────────

@space_bp.route("/<space_id>/team", methods=["GET"])
@login_required
def list_team(current_user, space_id):
    """Return all team members (invited or active) for a space."""
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to view this space's team.")), 403

    members = find_members_by_space(oid)
    return jsonify(ok([serialize_member(m) for m in members])), 200


@space_bp.route("/<space_id>/team", methods=["POST"])
@login_required
def invite_team_member(current_user, space_id):
    """
    Invite a new team member to a space.
    Body: {"email": "...", "name": "...", "role": "admin"|"viewer"}
    Dev mode: returns invite token and URL in response.
    """
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to invite members to this space.")), 403

    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    email = data.get("email", "").strip()
    name = data.get("name", "").strip()
    role = data.get("role", "viewer").strip()

    if not email:
        return jsonify(err("Email is required.")), 400
    if not name:
        return jsonify(err("Name is required.")), 400
    if role not in ("admin", "viewer"):
        return jsonify(err("role must be 'admin' or 'viewer'.")), 400

    invite_token = secrets.token_urlsafe(32)
    member = invite_member(oid, current_user["_id"], email, name, role, invite_token)

    # Send (or fake-send) the invite email
    email_result = send_team_invite(
        to_email=email,
        space_name=space["name"],
        inviter_name=current_user["name"],
        role=role,
        token=invite_token,
    )

    return jsonify(ok(
        data={
            "member": serialize_member(member),
            "dev_email": email_result,
        },
        message=f"Invite sent to {email}."
    )), 201


@space_bp.route("/<space_id>/team/<member_id>", methods=["PUT"])
@login_required
def update_team_member(current_user, space_id, member_id):
    """
    Update a team member's role.
    Body: {"role": "admin"|"viewer"}
    Only the space owner can change roles.
    """
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to update team members.")), 403

    mid = to_object_id(member_id)
    if not mid:
        return jsonify(err("Invalid member ID.")), 400

    member = find_member_by_id(mid)
    if not member or str(member["space_id"]) != str(oid):
        return jsonify(err("Team member not found.")), 404

    data = request.get_json()
    role = data.get("role", "").strip() if data else ""
    if role not in ("admin", "viewer"):
        return jsonify(err("role must be 'admin' or 'viewer'.")), 400

    update_member_role(mid, role)
    updated_member = find_member_by_id(mid)
    return jsonify(ok(serialize_member(updated_member), "Role updated.")), 200


@space_bp.route("/<space_id>/team/<member_id>", methods=["DELETE"])
@login_required
def remove_team_member(current_user, space_id, member_id):
    """
    Remove a team member from a space.
    Only the space owner can remove members.
    """
    oid = to_object_id(space_id)
    if not oid:
        return jsonify(err("Invalid space ID.")), 400

    space = find_space_by_id(oid)
    if not space:
        return jsonify(err("Space not found.")), 404

    if space["owner_id"] != current_user["_id"]:
        return jsonify(err("You do not have permission to remove team members.")), 403

    mid = to_object_id(member_id)
    if not mid:
        return jsonify(err("Invalid member ID.")), 400

    member = find_member_by_id(mid)
    if not member or str(member["space_id"]) != str(oid):
        return jsonify(err("Team member not found.")), 404

    remove_member(mid)
    return jsonify(ok(message="Team member removed.")), 200
