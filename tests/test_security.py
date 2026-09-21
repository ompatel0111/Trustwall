"""
Security test suite.
Tests:
- Unauthenticated access prevention on private routes.
- Cross-user space modification prevention (authorization boundary).
"""

import uuid
from models.user_model import create_user
import bcrypt


def test_unauthenticated_routes_blocked(client):
    """Protected endpoints must reject requests without auth credentials."""
    endpoints = [
        ("GET", "/api/user/me"),
        ("PUT", "/api/user/me"),
        ("GET", "/api/spaces"),
        ("POST", "/api/spaces"),
        ("GET", "/api/testimonials"),
        ("POST", "/api/testimonials/507f1f77bcf86cd799439011/approve"),
    ]
    for method, path in endpoints:
        if method == "GET":
            res = client.get(path)
        elif method == "PUT":
            res = client.put(path, json={"name": "New Name"})
        else:
            res = client.post(path, json={})
        assert res.status_code == 401, f"{method} {path} should be protected but returned {res.status_code}"


def test_cross_user_space_isolation(app, auth_client, db):
    """A user should never be able to update or delete another user's space."""
    # User 1 creates a space
    uid = str(uuid.uuid4())[:8]
    slug = f"user1-space-{uid}"
    create_res = auth_client.post("/api/spaces", json={
        "name": "User 1 Space",
        "slug": slug
    })
    assert create_res.status_code == 201
    space_id = create_res.get_json()["data"]["id"]

    # Create User 2 with a completely fresh, isolated client
    uid2 = str(uuid.uuid4())[:8]
    u2_pw = "Password123!"
    u2_hash = bcrypt.hashpw(u2_pw.encode(), bcrypt.gensalt()).decode()
    user2 = create_user("User Two", f"u2_{uid2}@test.com", u2_hash)

    client2 = app.test_client()
    login_res = client2.post("/api/auth/login", json={"email": user2["email"], "password": u2_pw})
    assert login_res.status_code == 200

    # User 2 attempts to modify User 1's space -> must be 403 Forbidden
    hack_res = client2.put(f"/api/spaces/{space_id}", json={"name": "Hacked Name"})
    assert hack_res.status_code == 403
    assert hack_res.get_json()["success"] is False

    # User 2 attempts to delete User 1's space -> must be 403 Forbidden
    del_res = client2.delete(f"/api/spaces/{space_id}")
    assert del_res.status_code == 403
    assert del_res.get_json()["success"] is False

    # Clean up User 2
    db.users.delete_one({"_id": user2["_id"]})
    db.refresh_tokens.delete_many({"user_id": user2["_id"]})
