"""
Public routes — no authentication required.

These routes are used by:
  - The collection form (/collect/:slug) when a customer submits a review
  - The Wall of Love (/wall/:slug) when displaying approved testimonials
  - The embed widget (/embed/:slug)

Endpoints:
    GET  /api/public/spaces/<slug>              — get space info for the collection form
    POST /api/public/spaces/<slug>/testimonials — submit a new testimonial
    GET  /api/public/spaces/<slug>/testimonials — get approved testimonials (wall/embed)
"""

from flask import Blueprint, request, jsonify
from models.space_model import find_space_by_slug, serialize_space
from models.testimonial_model import (
    create_testimonial, find_approved_testimonials, serialize_testimonial
)
from utils.validation import is_valid_email, is_valid_rating, is_valid_review
from utils.helpers import ok, err

public_bp = Blueprint("public", __name__, url_prefix="/api/public")


@public_bp.route("/spaces/<slug>", methods=["GET"])
def get_space(slug):
    """
    Return public space info for the collection form.
    Only safe fields are returned — no owner details.
    """
    space = find_space_by_slug(slug)
    if not space:
        return jsonify(err("Space not found.")), 404

    # Only return fields that are safe for public display
    public_data = {
        "name": space["name"],
        "slug": space["slug"],
        "description": space.get("description", ""),
        "prompt": space.get("prompt", "How was your experience?"),
        "enable_rating": space.get("enable_rating", True),
        "custom_questions": space.get("custom_questions", []),
    }
    return jsonify(ok(public_data)), 200


@public_bp.route("/spaces/<slug>/testimonials", methods=["POST"])
def submit_testimonial(slug):
    """
    Accept a testimonial submission from a customer.
    No login required. Testimonial starts as 'pending'.
    """
    space = find_space_by_slug(slug)
    if not space:
        return jsonify(err("Space not found.")), 404

    data = request.get_json()
    if not data:
        return jsonify(err("Request body is required.")), 400

    # ── Validate required fields ───────────────────────────────────────────────
    name = data.get("name", "").strip()
    if not name:
        return jsonify(err("Your name is required.")), 400

    email = data.get("email", "").strip()
    if not is_valid_email(email):
        return jsonify(err("A valid email address is required.")), 400

    review = data.get("review", "").strip()
    valid_review, review_msg = is_valid_review(review)
    if not valid_review:
        return jsonify(err(review_msg)), 400

    # ── Optional fields ────────────────────────────────────────────────────────
    company_role = data.get("company_role", "").strip()
    headline = data.get("headline", "").strip()
    social_link = data.get("social_link", "").strip()
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    consent = bool(data.get("consent", True))

    # Rating is optional if the space has ratings disabled
    rating = None
    if space.get("enable_rating", True):
        raw_rating = data.get("rating")
        if raw_rating is not None:
            if not is_valid_rating(raw_rating):
                return jsonify(err("Rating must be a number between 1 and 5.")), 400
            rating = int(raw_rating)

    # Custom question answers (list of strings)
    custom_answers = data.get("custom_answers", [])
    if not isinstance(custom_answers, list):
        custom_answers = []

    # ── Create the testimonial ─────────────────────────────────────────────────
    testimonial = create_testimonial(
        space_id=space["_id"],
        name=name,
        email=email,
        company_role=company_role,
        rating=rating,
        review=review,
        custom_answers=custom_answers,
        headline=headline,
        social_link=social_link,
        tags=tags,
        consent=consent,
    )

    # Auto-moderation rules
    auto_approve = space.get("auto_approve_high_rating", False)
    auto_feature = space.get("auto_feature_top_rating", False)
    if auto_approve and rating and int(rating) >= 4:
        from models.testimonial_model import update_testimonial_status
        update_testimonial_status(testimonial["_id"], "approved")
    if auto_feature and rating and int(rating) == 5:
        from models.testimonial_model import toggle_featured
        toggle_featured(testimonial["_id"], True)

    return jsonify(ok(
        data={"id": str(testimonial["_id"])},
        message="Thank you! Your testimonial has been submitted."
    )), 201


@public_bp.route("/spaces/<slug>/testimonials", methods=["GET"])
def get_approved_testimonials(slug):
    """
    Return all approved testimonials for a space.
    Used by the Wall of Love and embed widget.
    Only approved testimonials are ever returned here.
    """
    space = find_space_by_slug(slug)
    if not space:
        return jsonify(err("Space not found.")), 404

    approved = find_approved_testimonials(space["_id"])
    return jsonify(ok([serialize_testimonial(t) for t in approved])), 200


@public_bp.route("/embed/<slug>", methods=["GET"])
def get_embed_data(slug):
    """
    Return space info + approved testimonials for the embed widget.
    """
    space = find_space_by_slug(slug)
    if not space:
        return jsonify(err("Space not found.")), 404

    approved = find_approved_testimonials(space["_id"])
    return jsonify(ok({
        "space": {
            "name": space["name"],
            "slug": space["slug"],
        },
        "testimonials": [serialize_testimonial(t) for t in approved],
    })), 200
