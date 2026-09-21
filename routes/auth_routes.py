"""
Authentication routes.

Endpoints:
    POST /api/auth/signup               — create a new account (sends verification email)
    POST /api/auth/login                — login, receive JWT cookies (requires email verified)
    POST /api/auth/refresh              — rotate refresh token, get new access token
    POST /api/auth/logout               — revoke refresh token, clear cookies
    POST /api/auth/forgot-password      — request a password reset token
    POST /api/auth/reset-password       — set a new password using the token
    GET  /api/auth/verify-email         — verify email using token from query param
    POST /api/auth/resend-verification  — resend verification email
"""

import bcrypt
import secrets
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import (
    create_access_token, create_refresh_token, decode_token
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from bson import ObjectId

from models.user_model import (
    create_user, find_user_by_email, find_user_by_id,
    find_user_by_verification_token, update_user, safe_user
)
from models.token_model import (
    store_refresh_token, find_valid_token,
    revoke_token, revoke_all_tokens_for_user
)
from utils.validation import is_valid_email, is_valid_password, is_valid_name
from utils.helpers import ok, err
from utils.email_service import send_verification_email
from config import Config

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _set_auth_cookies(response, access_token: str, refresh_token: str):
    """Set both JWT tokens as httpOnly cookies on the response."""
    # Access token cookie — short-lived (15 min)
    response.set_cookie(
        "access_token_cookie",
        access_token,
        httponly=True,
        samesite="Lax",
        secure=False,   # set to True in production with HTTPS
        max_age=15 * 60,
    )
    # Refresh token cookie — long-lived (7 days)
    response.set_cookie(
        "refresh_token_cookie",
        refresh_token,
        httponly=True,
        samesite="Lax",
        secure=False,
        max_age=7 * 24 * 60 * 60,
    )


def _clear_auth_cookies(response):
    """Remove both JWT cookies (used on logout)."""
    response.delete_cookie("access_token_cookie")
    response.delete_cookie("refresh_token_cookie")


# ── Routes ─────────────────────────────────────────────────────────────────────

@auth_bp.route("/signup", methods=["POST"])
def signup():
    """
    Create a new user account.
    Sends an email verification link (dev mode: returns token in response).
    User must verify email before they can log in.
    """
    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required."))

    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    # ── Validate inputs ────────────────────────────────────────────────────────
    if not is_valid_name(name):
        return jsonify(err("Name is required (max 100 characters).")), 400

    if not is_valid_email(email):
        return jsonify(err("Please enter a valid email address.")), 400

    valid_pw, pw_msg = is_valid_password(password)
    if not valid_pw:
        return jsonify(err(pw_msg)), 400

    # ── Check for duplicate email ──────────────────────────────────────────────
    if find_user_by_email(email):
        return jsonify(err("An account with this email already exists.")), 409

    # ── Generate email verification token ─────────────────────────────────────
    verification_token = secrets.token_urlsafe(32)
    verification_expiry = datetime.now(timezone.utc).timestamp() + 86400  # 24 hours

    # ── Hash the password and create the user ─────────────────────────────────
    # bcrypt.hashpw does the heavy lifting — never store plain-text passwords
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = create_user(
        name, email, password_hash,
        verification_token=verification_token,
        verification_expiry=verification_expiry,
    )

    # ── Send the verification email to user's real email inbox ────────────────
    send_verification_email(email, name, verification_token)

    return jsonify(ok(
        data={
            "user": safe_user(user),
            "verification_sent": True,
        },
        message="Account created. Please check your email to activate your account."
    )), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate a user and return JWT tokens as httpOnly cookies.
    Requires email_verified == True.
    """
    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    email = data.get("email", "").strip()
    password = data.get("password", "")

    # ── Find the user ──────────────────────────────────────────────────────────
    user = find_user_by_email(email)

    # Use a generic error message to avoid revealing whether the email exists
    # (this is called a "timing-safe" or "user-enumeration-safe" response)
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify(err("Invalid email or password.")), 401

    # ── Enforce email verification ─────────────────────────────────────────────
    if not user.get("email_verified", False):
        return jsonify({
            "success": False,
            "email_verified": False,
            "message": "Please verify your email before logging in.",
        }), 403

    # ── Create JWT tokens ──────────────────────────────────────────────────────
    user_id_str = str(user["_id"])
    access_token = create_access_token(identity=user_id_str)
    refresh_token = create_refresh_token(identity=user_id_str)

    # ── Store the hashed refresh token in MongoDB ──────────────────────────────
    expires_at = datetime.now(timezone.utc) + Config.JWT_REFRESH_TOKEN_EXPIRES
    store_refresh_token(user["_id"], refresh_token, expires_at)

    # ── Set cookies and return ─────────────────────────────────────────────────
    response = make_response(jsonify(ok(safe_user(user), "Login successful.")))
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    """
    Rotate the refresh token.

    Flow:
      1. Read the refresh token cookie.
      2. Decode and validate it.
      3. Revoke the old refresh token.
      4. Issue new access + refresh tokens (rotation).
      5. Store the new refresh token.
    """
    # Step 1: Get the raw refresh token from cookie
    raw_token = request.cookies.get("refresh_token_cookie")
    if not raw_token:
        return jsonify(err("Refresh token not found.")), 401

    # Step 2: Decode and validate
    try:
        decoded = decode_token(raw_token, allow_expired=False)
        if decoded.get("type") != "refresh":
            return jsonify(err("Invalid token type.")), 401
    except Exception:
        return jsonify(err("Invalid or expired refresh token.")), 401

    user_id_str = decoded.get("sub")
    user_id = ObjectId(user_id_str)

    # Step 3: Find and validate the token in the database
    token_record = find_valid_token(user_id, raw_token)
    if not token_record:
        # Token was not found or already revoked — possible token theft attempt
        revoke_all_tokens_for_user(user_id)   # security: revoke all sessions
        return jsonify(err("Session expired. Please login again.")), 401

    # Step 4: Revoke the old refresh token (rotation)
    revoke_token(token_record["_id"])

    # Step 5: Issue new tokens
    new_access_token = create_access_token(identity=user_id_str)
    new_refresh_token = create_refresh_token(identity=user_id_str)

    # Step 6: Store the new refresh token
    expires_at = datetime.now(timezone.utc) + Config.JWT_REFRESH_TOKEN_EXPIRES
    store_refresh_token(user_id, new_refresh_token, expires_at)

    response = make_response(jsonify(ok(message="Token refreshed.")))
    _set_auth_cookies(response, new_access_token, new_refresh_token)
    return response


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """
    Log out the current user.
    Revokes their refresh token and clears the JWT cookies.
    """
    raw_token = request.cookies.get("refresh_token_cookie")

    # Try to revoke the token if it exists
    if raw_token:
        try:
            decoded = decode_token(raw_token, allow_expired=True)
            user_id = ObjectId(decoded.get("sub"))
            token_record = find_valid_token(user_id, raw_token)
            if token_record:
                revoke_token(token_record["_id"])
        except Exception:
            pass  # Token already invalid — still clear the cookies

    response = make_response(jsonify(ok(message="Logged out successfully.")))
    _clear_auth_cookies(response)
    return response


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    Generate a password reset token.
    In development, the token is returned directly in the response.
    In production, you would send it via email.
    """
    data = request.get_json()
    email = data.get("email", "").strip() if data else ""

    if not is_valid_email(email):
        return jsonify(err("Please enter a valid email address.")), 400

    user = find_user_by_email(email)

    # Always return the same message to prevent user enumeration
    if not user:
        return jsonify(ok(message="If an account exists, a reset link has been sent.")), 200

    # Generate a secure random token
    reset_token = secrets.token_urlsafe(32)
    reset_expiry = datetime.now(timezone.utc).timestamp() + 3600  # 1 hour

    update_user(user["_id"], {
        "reset_token": reset_token,
        "reset_token_expiry": reset_expiry,
    })

    # In development: return the token directly so you can test without email
    return jsonify(ok(
        data={"reset_token": reset_token},
        message="Reset token generated. (Development: token returned in response)"
    )), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Reset a user's password using the token from forgot-password.
    """
    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    token = data.get("token", "").strip()
    new_password = data.get("password", "")

    if not token:
        return jsonify(err("Reset token is required.")), 400

    valid_pw, pw_msg = is_valid_password(new_password)
    if not valid_pw:
        return jsonify(err(pw_msg)), 400

    # Find the user with this token
    from database import db
    user = db.users.find_one({"reset_token": token})

    if not user:
        return jsonify(err("Invalid or expired reset token.")), 400

    # Check the token hasn't expired (1-hour window)
    if datetime.now(timezone.utc).timestamp() > user.get("reset_token_expiry", 0):
        return jsonify(err("Reset token has expired. Please request a new one.")), 400

    # Hash the new password and clear the reset token
    new_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    update_user(user["_id"], {
        "password_hash": new_hash,
        "reset_token": None,
        "reset_token_expiry": None,
    })

    # Revoke all existing sessions for security
    revoke_all_tokens_for_user(user["_id"])

    return jsonify(ok(message="Password reset successfully. Please login.")), 200


@auth_bp.route("/verify-email", methods=["GET"])
def verify_email():
    """
    Verify a user's email address using the token from the verification link.
    After successful verification, automatically logs the user in by issuing
    JWT cookies — so the frontend can redirect directly to the dashboard.
    Query param: token (string)
    """
    token = request.args.get("token", "").strip()
    if not token:
        return jsonify(err("Verification token is required.")), 400

    user = find_user_by_verification_token(token)
    if not user:
        return jsonify(err("Invalid or expired verification token.")), 400

    # Check expiry (24-hour window)
    if datetime.now(timezone.utc).timestamp() > user.get("verification_expiry", 0):
        return jsonify(err("Verification token has expired. Please request a new one.")), 400

    # Mark email as verified and clear the token
    update_user(user["_id"], {
        "email_verified": True,
        "verification_token": None,
        "verification_expiry": None,
    })

    # ── Auto-login: issue JWT tokens so user goes straight to dashboard ────────
    user_id_str = str(user["_id"])
    access_token  = create_access_token(identity=user_id_str)
    refresh_token = create_refresh_token(identity=user_id_str)

    expires_at = datetime.now(timezone.utc) + Config.JWT_REFRESH_TOKEN_EXPIRES
    store_refresh_token(user["_id"], refresh_token, expires_at)

    response = make_response(jsonify(ok(
        data={"user": safe_user(user), "auto_logged_in": True},
        message="Email verified! Welcome to Proofly."
    )))
    _set_auth_cookies(response, access_token, refresh_token)
    return response, 200


@auth_bp.route("/resend-verification", methods=["POST"])
def resend_verification():
    """
    Resend the email verification link to the given email.
    Body: {"email": "..."}
    Returns verify_url and smtp_sent at the top level of data so the frontend
    can show the link on-screen if SMTP is not configured.
    """
    data = request.get_json()
    email = data.get("email", "").strip() if data else ""

    if not is_valid_email(email):
        return jsonify(err("Please enter a valid email address.")), 400

    user = find_user_by_email(email)

    # Don't reveal whether the email exists
    if not user:
        return jsonify(ok(message="If an account exists, a verification email has been sent.")), 200

    if user.get("email_verified", False):
        return jsonify(err("This email is already verified.")), 400

    # Generate a fresh token with a new 24-hour window
    new_token = secrets.token_urlsafe(32)
    new_expiry = datetime.now(timezone.utc).timestamp() + 86400

    update_user(user["_id"], {
        "verification_token": new_token,
        "verification_expiry": new_expiry,
    })

    send_verification_email(email, user["name"], new_token)

    return jsonify(ok(
        data={"verification_sent": True},
        message="Verification email sent. Please check your inbox."
    )), 200

