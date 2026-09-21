"""
Authentication middleware.

The @login_required decorator verifies the JWT access token
from the httpOnly cookie (or Authorization Bearer header)
before allowing access to protected routes.
"""

from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import decode_token
from bson import ObjectId
from models.user_model import find_user_by_id


def login_required(f):
    """
    Decorator that:
    1. Reads the JWT access token from 'access_token_cookie' or Authorization header.
    2. Decodes and validates the token.
    3. Loads the current user from MongoDB.
    4. Passes the user object to the route as `current_user`.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Step 1: Get token from cookie or Authorization header
        token = request.cookies.get("access_token_cookie")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()

        if not token:
            return jsonify({"success": False, "message": "Authentication required."}), 401

        # Step 2: Decode and validate the token using Flask-JWT-Extended
        try:
            decoded = decode_token(token)
            if decoded.get("type") != "access":
                return jsonify({"success": False, "message": "Invalid token type."}), 401
        except Exception:
            return jsonify({"success": False, "message": "Invalid or expired token. Please log in again."}), 401

        # Step 3: Get the user ID from the token's 'sub' (subject) claim
        user_id_str = decoded.get("sub")
        if not user_id_str:
            return jsonify({"success": False, "message": "Invalid token."}), 401

        # Step 4: Load the user from MongoDB
        try:
            user = find_user_by_id(ObjectId(user_id_str))
        except Exception:
            return jsonify({"success": False, "message": "Invalid token."}), 401

        if not user:
            return jsonify({"success": False, "message": "User not found."}), 401

        # Step 5: Call the route, injecting the user
        return f(current_user=user, *args, **kwargs)

    return wrapper
