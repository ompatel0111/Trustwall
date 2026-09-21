"""
Testimonials moderation test suite.
Tests: list testimonials, approve, reject, archive, feature, like.
"""

import uuid


def _create_space_and_testimonial(client, auth_client):
    uid = str(uuid.uuid4())[:8]
    slug = f"space-{uid}"
    space_res = auth_client.post("/api/spaces", json={
        "name": f"Space {uid}",
        "slug": slug,
        "enable_rating": True
    })
    space_id = space_res.get_json()["data"]["id"]

    sub_res = client.post(f"/api/public/spaces/{slug}/testimonials", json={
        "name": "Jane Reviewer",
        "email": "jane@example.com",
        "company_role": "Product Designer",
        "rating": 5,
        "review": "Exceptional tool. Simple, delightful, and highly effective for our brand."
    })
    testimonial_id = sub_res.get_json()["data"]["id"]
    return space_id, testimonial_id, slug


def test_list_testimonials(client, auth_client):
    """Owner should be able to list testimonials for their space."""
    space_id, t_id, _ = _create_space_and_testimonial(client, auth_client)

    res = auth_client.get(f"/api/testimonials?space_id={space_id}")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["total"] >= 1
    assert any(t["id"] == t_id for t in data["testimonials"])


def test_approve_testimonial(client, auth_client):
    """Owner can approve a pending testimonial."""
    space_id, t_id, _ = _create_space_and_testimonial(client, auth_client)

    res = auth_client.post(f"/api/testimonials/{t_id}/approve")
    assert res.status_code == 200
    assert res.get_json()["success"] is True

    # Check status changed to approved
    list_res = auth_client.get(f"/api/testimonials?space_id={space_id}&status=approved")
    approved_ids = [t["id"] for t in list_res.get_json()["data"]["testimonials"]]
    assert t_id in approved_ids


def test_reject_testimonial(client, auth_client):
    """Owner can reject a pending testimonial."""
    space_id, t_id, _ = _create_space_and_testimonial(client, auth_client)

    res = auth_client.post(f"/api/testimonials/{t_id}/reject")
    assert res.status_code == 200

    list_res = auth_client.get(f"/api/testimonials?space_id={space_id}&status=rejected")
    rejected_ids = [t["id"] for t in list_res.get_json()["data"]["testimonials"]]
    assert t_id in rejected_ids


def test_toggle_feature_testimonial(client, auth_client):
    """Owner can toggle the featured status of a testimonial."""
    space_id, t_id, _ = _create_space_and_testimonial(client, auth_client)

    res = auth_client.post(f"/api/testimonials/{t_id}/feature")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True


def test_toggle_like_testimonial(client, auth_client):
    """Owner can toggle like on a testimonial."""
    space_id, t_id, _ = _create_space_and_testimonial(client, auth_client)

    res = auth_client.post(f"/api/testimonials/{t_id}/like")
    assert res.status_code == 200
    assert res.get_json()["success"] is True
