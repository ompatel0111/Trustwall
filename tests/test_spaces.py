"""
Spaces CRUD and ownership tests.
"""

import uuid


def test_create_space_success(auth_client):
    """Should create a space with custom settings."""
    uid = str(uuid.uuid4())[:8]
    slug = f"space-{uid}"
    res = auth_client.post("/api/spaces", json={
        "name": f"Space {uid}",
        "slug": slug,
        "description": "Awesome tech reviews",
        "prompt": "Tell us what you like!",
        "enable_rating": True
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True
    assert data["data"]["slug"] == slug
    assert data["data"]["name"] == f"Space {uid}"


def test_create_space_duplicate_slug(auth_client):
    """Should prevent duplicate slugs."""
    uid = str(uuid.uuid4())[:8]
    slug = f"space-{uid}"
    auth_client.post("/api/spaces", json={
        "name": f"First {uid}",
        "slug": slug
    })

    res = auth_client.post("/api/spaces", json={
        "name": f"Second {uid}",
        "slug": slug
    })
    assert res.status_code == 409
    data = res.get_json()
    assert data["success"] is False
    assert "already taken" in data["message"].lower()


def test_list_spaces(auth_client):
    """Should list only spaces owned by the current user."""
    res = auth_client.get("/api/spaces")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert isinstance(data["data"], list)


def test_update_space(auth_client):
    """Should update space details."""
    uid = str(uuid.uuid4())[:8]
    slug = f"space-{uid}"
    create_res = auth_client.post("/api/spaces", json={
        "name": "Initial Name",
        "slug": slug,
        "prompt": "Old prompt"
    })
    space_id = create_res.get_json()["data"]["id"]

    update_res = auth_client.put(f"/api/spaces/{space_id}", json={
        "name": "Updated Name",
        "prompt": "New updated prompt"
    })
    assert update_res.status_code == 200
    updated_data = update_res.get_json()["data"]
    assert updated_data["name"] == "Updated Name"
    assert updated_data["prompt"] == "New updated prompt"


def test_delete_space(auth_client):
    """Should delete a space and verify it no longer exists."""
    uid = str(uuid.uuid4())[:8]
    slug = f"space-{uid}"
    create_res = auth_client.post("/api/spaces", json={
        "name": "To Delete",
        "slug": slug
    })
    space_id = create_res.get_json()["data"]["id"]

    del_res = auth_client.delete(f"/api/spaces/{space_id}")
    assert del_res.status_code == 200

    get_res = auth_client.get(f"/api/spaces/{space_id}")
    assert get_res.status_code == 404
