"""
Authentication test suite.
Tests: signup, login, cookie issuance, token refresh, logout, password reset.
"""

import uuid
from database import get_db


def test_signup_success(client):
    """Should successfully register a new user."""
    uid = str(uuid.uuid4())[:8]
    res = client.post("/api/auth/signup", json={
        "name": f"New User {uid}",
        "email": f"signup_{uid}@example.com",
        "password": "SecurePassword123!"
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True
    assert data["data"]["email"] == f"signup_{uid}@example.com"
    assert "password_hash" not in data["data"]


def test_signup_duplicate_email(client, test_user):
    """Should reject duplicate email registration."""
    res = client.post("/api/auth/signup", json={
        "name": "Duplicate User",
        "email": test_user["email"],
        "password": "Password123!"
    })
    assert res.status_code == 409
    data = res.get_json()
    assert data["success"] is False
    assert "already exists" in data["message"].lower()


def test_signup_invalid_password(client):
    """Should reject passwords under 8 characters."""
    res = client.post("/api/auth/signup", json={
        "name": "Short Pass User",
        "email": "shortpass@example.com",
        "password": "short"
    })
    assert res.status_code == 400
    data = res.get_json()
    assert data["success"] is False


def test_login_success(client, test_user):
    """Should authenticate user and set access + refresh cookies."""
    res = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": test_user["raw_password"]
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True

    # Check cookies
    access_cookie = client.get_cookie("access_token_cookie")
    refresh_cookie = client.get_cookie("refresh_token_cookie")
    assert access_cookie is not None
    assert refresh_cookie is not None


def test_login_invalid_credentials(client, test_user):
    """Should reject incorrect password."""
    res = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "WrongPassword999"
    })
    assert res.status_code == 401
    data = res.get_json()
    assert data["success"] is False


def test_refresh_token_rotation(auth_client, test_user):
    """Should rotate refresh token and issue new access token."""
    old_cookie = auth_client.get_cookie("refresh_token_cookie")
    assert old_cookie is not None
    old_refresh = old_cookie.value

    res = auth_client.post("/api/auth/refresh")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True

    new_cookie = auth_client.get_cookie("refresh_token_cookie")
    assert new_cookie is not None
    assert new_cookie.value != old_refresh


def test_logout(auth_client):
    """Should revoke refresh token and clear cookies."""
    res = auth_client.post("/api/auth/logout")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True

    # Calling a protected route should now fail
    protected_res = auth_client.get("/api/user/me")
    assert protected_res.status_code == 401


def test_forgot_and_reset_password(client, test_user):
    """Should issue reset token and allow password reset."""
    # Step 1: Request reset
    forgot_res = client.post("/api/auth/forgot-password", json={
        "email": test_user["email"]
    })
    assert forgot_res.status_code == 200
    forgot_data = forgot_res.get_json()
    reset_token = forgot_data["data"]["reset_token"]
    assert reset_token is not None

    # Step 2: Reset password
    new_password = "BrandNewPassword2026!"
    reset_res = client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "password": new_password
    })
    assert reset_res.status_code == 200

    # Step 3: Login with new password
    login_res = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": new_password
    })
    assert login_res.status_code == 200
