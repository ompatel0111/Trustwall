"""
Public endpoints test suite (zero authentication required).
Tests: get space by slug, submit testimonial, get approved testimonials (Wall), get embed data.
"""

import uuid


def test_public_get_space(client, auth_client):
    """Anyone can query a space by its public slug."""
    uid = str(uuid.uuid4())[:8]
    slug = f"pub-space-{uid}"
    auth_client.post("/api/spaces", json={
        "name": f"Public Brand {uid}",
        "slug": slug,
        "prompt": "How did we do?"
    })

    res = client.get(f"/api/public/spaces/{slug}")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["name"] == f"Public Brand {uid}"
    assert data["slug"] == slug
    assert "owner_id" not in data  # Owner details should not be leaked


def test_public_submit_testimonial(client, auth_client):
    """Anyone can submit a testimonial via the public endpoint."""
    uid = str(uuid.uuid4())[:8]
    slug = f"pub-space-{uid}"
    auth_client.post("/api/spaces", json={"name": f"Brand {uid}", "slug": slug})

    res = client.post(f"/api/public/spaces/{slug}/testimonials", json={
        "name": "Public Submitter",
        "email": "submitter@example.com",
        "company_role": "Customer",
        "rating": 5,
        "review": "Fast delivery and great customer service. Will buy again!"
    })
    assert res.status_code == 201
    assert res.get_json()["success"] is True


def test_public_wall_approved_only(client, auth_client):
    """Public wall should ONLY return approved testimonials."""
    uid = str(uuid.uuid4())[:8]
    slug = f"pub-space-{uid}"
    auth_client.post("/api/spaces", json={"name": f"Brand {uid}", "slug": slug})

    # Submit 2 testimonials
    t1 = client.post(f"/api/public/spaces/{slug}/testimonials", json={
        "name": "User One", "email": "one@test.com", "rating": 5,
        "review": "Review number one is pending"
    }).get_json()["data"]["id"]

    t2 = client.post(f"/api/public/spaces/{slug}/testimonials", json={
        "name": "User Two", "email": "two@test.com", "rating": 5,
        "review": "Review number two will be approved"
    }).get_json()["data"]["id"]

    # Wall should be empty before approval
    wall_before = client.get(f"/api/public/spaces/{slug}/testimonials")
    assert len(wall_before.get_json()["data"]) == 0

    # Approve t2 only
    auth_client.post(f"/api/testimonials/{t2}/approve")

    # Wall should now contain only t2
    wall_after = client.get(f"/api/public/spaces/{slug}/testimonials")
    approved_list = wall_after.get_json()["data"]
    assert len(approved_list) == 1
    assert approved_list[0]["id"] == t2
    assert approved_list[0]["name"] == "User Two"


def test_public_embed_data(client, auth_client):
    """Embed endpoint returns space metadata and approved testimonials."""
    uid = str(uuid.uuid4())[:8]
    slug = f"embed-space-{uid}"
    auth_client.post("/api/spaces", json={"name": f"Brand {uid}", "slug": slug})

    res = client.get(f"/api/public/embed/{slug}")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert "space" in data
    assert "testimonials" in data
    assert data["space"]["slug"] == slug
