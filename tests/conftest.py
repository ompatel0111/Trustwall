"""
Pytest configuration and shared fixtures for Proofly tests.
"""

import pytest
import uuid
from app import create_app
from database import get_db
from models.user_model import create_user
import bcrypt


@pytest.fixture(scope="session")
def app():
    """Create application configured for testing."""
    test_app = create_app({
        "TESTING": True,
        "DEBUG": False,
        "RATELIMIT_ENABLED": False,
    })
    return test_app


@pytest.fixture(scope="function")
def client(app):
    """Test client for making requests."""
    return app.test_client()


@pytest.fixture(scope="function")
def db():
    """Direct access to the database for assertions."""
    return get_db()


@pytest.fixture(scope="function")
def test_user(db):
    """Create a persistent test user and yield user dict, clean up after."""
    uid = str(uuid.uuid4())[:8]
    email = f"pytest_{uid}@test.com"
    raw_password = "Password123!"
    password_hash = bcrypt.hashpw(raw_password.encode(), bcrypt.gensalt()).decode()
    user = create_user(f"Pytest User {uid}", email, password_hash)
    user["raw_password"] = raw_password

    yield user

    # Cleanup
    db.users.delete_one({"_id": user["_id"]})
    db.spaces.delete_many({"owner_id": user["_id"]})
    db.refresh_tokens.delete_many({"user_id": user["_id"]})


@pytest.fixture(scope="function")
def auth_client(client, test_user):
    """Test client pre-authenticated with test_user session."""
    res = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": test_user["raw_password"]
    })
    assert res.status_code == 200, f"Setup login failed: {res.get_json()}"
    return client
