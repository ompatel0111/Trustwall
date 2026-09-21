"""
User routes — profile management.

Endpoints:
    GET  /api/user/me        — get current user profile
    PUT  /api/user/me        — update name or password
"""

import bcrypt
from flask import Blueprint, request, jsonify
from models.user_model import update_user, safe_user
from utils.validation import is_valid_name, is_valid_password
from utils.helpers import ok, err
from middleware.auth_middleware import login_required

user_bp = Blueprint("user", __name__, url_prefix="/api/user")


@user_bp.route("/me", methods=["GET"])
@login_required
def get_me(current_user):
    """Return the logged-in user's profile."""
    return jsonify(ok(safe_user(current_user))), 200


@user_bp.route("/me", methods=["PUT"])
@login_required
def update_me(current_user):
    """Update the logged-in user's name or password."""
    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    updates = {}

    # Optional: update name
    if "name" in data:
        name = data["name"].strip()
        if not is_valid_name(name):
            return jsonify(err("Name must be between 1 and 100 characters.")), 400
        updates["name"] = name

    # Optional: update password
    if "password" in data:
        valid, msg = is_valid_password(data["password"])
        if not valid:
            return jsonify(err(msg)), 400
        updates["password_hash"] = bcrypt.hashpw(
            data["password"].encode(), bcrypt.gensalt()
        ).decode()

    if not updates:
        return jsonify(err("Nothing to update.")), 400

    update_user(current_user["_id"], updates)
    return jsonify(ok(message="Profile updated successfully.")), 200
