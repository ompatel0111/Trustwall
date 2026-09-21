"""
Testimonial model — helper functions for the testimonials MongoDB collection.

Workflow:
    Customer submits → status: "pending"
    Owner approves  → status: "approved"  (appears on Wall of Love & embeds)
    Owner rejects   → status: "rejected"
    Owner archives  → status: "archived"

Schema:
    _id            : ObjectId
    space_id       : ObjectId    (references spaces._id)
    name           : str
    email          : str
    company_role   : str
    rating         : int         (1–5, or None if rating disabled)
    review         : str
    custom_answers : list[str]   (answers to custom questions)
    status         : str         ("pending" | "approved" | "rejected" | "archived")
    featured       : bool        (pinned to top of Wall of Love)
    liked          : bool        (owner bookmarked it)
    created_at     : datetime
    updated_at     : datetime
"""

from datetime import datetime, timezone, timedelta
from bson import ObjectId
from database import db

testimonials = db.testimonials


def create_testimonial(space_id, name: str, email: str, company_role: str,
                       rating: int | None, review: str,
                       custom_answers: list = None,
                       headline: str = "",
                       social_link: str = "",
                       tags: list = None,
                       consent: bool = True) -> dict:
    """Insert a new testimonial. Always starts as 'pending'."""
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)

    now = datetime.now(timezone.utc)
    doc = {
        "space_id": space_id,
        "name": name,
        "email": email.lower().strip(),
        "company_role": company_role,
        "rating": rating,
        "review": review,
        "custom_answers": custom_answers or [],
        "headline": headline.strip() if headline else "",
        "social_link": social_link.strip() if social_link else "",
        "tags": [t.strip() for t in tags if t.strip()] if tags else [],
        "consent": bool(consent),
        "status": "pending",
        "featured": False,
        "liked": False,
        "created_at": now,
        "updated_at": now,
    }
    result = testimonials.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def find_testimonial_by_id(testimonial_id) -> dict | None:
    if isinstance(testimonial_id, str):
        testimonial_id = ObjectId(testimonial_id)
    return testimonials.find_one({"_id": testimonial_id})


def find_testimonials_by_space(space_id, status: str = None, page: int = 1, per_page: int = 20,
                               search: str = None, rating: int = None, tag: str = None) -> tuple[list, int]:
    """
    Return a paginated list of testimonials for a space.
    Supports optional full-text search, rating filter, and tag filter.
    Returns (list_of_docs, total_count).
    """
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)

    query = {"space_id": space_id}
    if status and status != "all":
        query["status"] = status

    # Search across multiple text fields using regex
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"name": regex},
            {"email": regex},
            {"review": regex},
            {"headline": regex},
            {"company_role": regex},
        ]

    # Filter by exact rating
    if rating is not None:
        query["rating"] = int(rating)

    # Filter by tag (any match in the tags array)
    if tag:
        query["tags"] = tag

    total = testimonials.count_documents(query)
    skip = (page - 1) * per_page
    docs = list(
        testimonials.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(per_page)
    )
    return docs, total


def find_approved_testimonials(space_id) -> list:
    """Return all approved testimonials for public display (Wall of Love / embed)."""
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)

    return list(
        testimonials.find({"space_id": space_id, "status": "approved"})
        .sort([("featured", -1), ("created_at", -1)])
    )


def update_testimonial_status(testimonial_id, status: str) -> None:
    """Change the moderation status of a testimonial."""
    if isinstance(testimonial_id, str):
        testimonial_id = ObjectId(testimonial_id)
    testimonials.update_one(
        {"_id": testimonial_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}}
    )


def toggle_featured(testimonial_id, value: bool) -> None:
    if isinstance(testimonial_id, str):
        testimonial_id = ObjectId(testimonial_id)
    testimonials.update_one(
        {"_id": testimonial_id},
        {"$set": {"featured": value, "updated_at": datetime.now(timezone.utc)}}
    )


def toggle_liked(testimonial_id, value: bool) -> None:
    if isinstance(testimonial_id, str):
        testimonial_id = ObjectId(testimonial_id)
    testimonials.update_one(
        {"_id": testimonial_id},
        {"$set": {"liked": value, "updated_at": datetime.now(timezone.utc)}}
    )


def delete_testimonial(testimonial_id) -> None:
    """Hard-delete a testimonial document."""
    if isinstance(testimonial_id, str):
        testimonial_id = ObjectId(testimonial_id)
    testimonials.delete_one({"_id": testimonial_id})


def restore_testimonial(testimonial_id) -> None:
    """Restore an archived testimonial back to 'pending' status."""
    if isinstance(testimonial_id, str):
        testimonial_id = ObjectId(testimonial_id)
    testimonials.update_one(
        {"_id": testimonial_id},
        {"$set": {"status": "pending", "updated_at": datetime.now(timezone.utc)}}
    )


def bulk_action(ids: list, action: str) -> None:
    """
    Apply a moderation action to multiple testimonials at once.
    action: 'approve' | 'reject' | 'archive' | 'delete'
    """
    object_ids = []
    for tid in ids:
        try:
            object_ids.append(ObjectId(tid) if isinstance(tid, str) else tid)
        except Exception:
            pass

    if not object_ids:
        return

    if action == "delete":
        testimonials.delete_many({"_id": {"$in": object_ids}})
    else:
        status_map = {
            "approve": "approved",
            "reject": "rejected",
            "archive": "archived",
        }
        status = status_map.get(action)
        if status:
            testimonials.update_many(
                {"_id": {"$in": object_ids}},
                {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}}
            )


def get_analytics(space_id, days: int = None) -> dict:
    """
    Calculate statistics for a space's testimonials.
    Returns avg rating, rating distribution, recommend rate, counts,
    time-series data (reviews_by_month), and tags breakdown.

    Args:
        space_id: The space ObjectId or string.
        days: If provided, only include testimonials from the last N days.
              None means all-time.
    """
    if isinstance(space_id, str):
        space_id = ObjectId(space_id)

    # Optional date filter
    date_filter = {}
    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        date_filter = {"created_at": {"$gte": cutoff}}

    base_query = {"space_id": space_id, **date_filter}

    approved = list(testimonials.find({**base_query, "status": "approved"}))
    total_approved = len(approved)

    rated = [t for t in approved if t.get("rating") is not None]
    avg_rating = round(sum(int(t["rating"]) for t in rated) / len(rated), 1) if rated else 0.0

    distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for t in rated:
        r = int(t.get("rating", 0))
        if r in distribution:
            distribution[r] += 1

    # Rich aggregate metrics
    positive_count = sum(distribution[r] for r in (4, 5))
    recommend_rate = round((positive_count / len(rated)) * 100) if rated else 0
    five_star_pct = round((distribution[5] / len(rated)) * 100) if rated else 0

    pending_count = testimonials.count_documents({**base_query, "status": "pending"})
    rejected_count = testimonials.count_documents({**base_query, "status": "rejected"})
    archived_count = testimonials.count_documents({**base_query, "status": "archived"})

    # ── Time-series: reviews by month (last 12 months) ────────────────────────
    now = datetime.now(timezone.utc)
    reviews_by_month = []
    all_for_months = list(testimonials.find({
        "space_id": space_id,
        "status": "approved",
        "created_at": {"$gte": now - timedelta(days=365)},
    }))

    for i in range(11, -1, -1):
        # Compute the first and last day of the target month
        target = now.replace(day=1) - timedelta(days=i * 28)
        year = target.year
        month = target.month
        month_key = f"{year:04d}-{month:02d}"

        month_docs = [
            t for t in all_for_months
            if t["created_at"].year == year and t["created_at"].month == month
        ]
        month_rated = [t for t in month_docs if t.get("rating") is not None]
        month_avg = (
            round(sum(int(t["rating"]) for t in month_rated) / len(month_rated), 1)
            if month_rated else 0.0
        )
        reviews_by_month.append({
            "month": month_key,
            "count": len(month_docs),
            "avg_rating": month_avg,
        })

    # ── Tags breakdown ─────────────────────────────────────────────────────────
    tag_counts: dict = {}
    for t in approved:
        for tag in t.get("tags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    tags_breakdown = [{"tag": tag, "count": cnt} for tag, cnt in sorted(tag_counts.items(), key=lambda x: -x[1])]

    return {
        "total": total_approved,
        "avg_rating": avg_rating,
        "distribution": distribution,
        "recommend_rate": recommend_rate,
        "five_star_pct": five_star_pct,
        "pending_count": pending_count,
        "rejected_count": rejected_count,
        "archived_count": archived_count,
        "reviews_by_month": reviews_by_month,
        "tags_breakdown": tags_breakdown,
    }


def serialize_testimonial(t: dict) -> dict:
    """Convert a testimonial document to a JSON-safe dict."""
    return {
        "id": str(t["_id"]),
        "space_id": str(t["space_id"]),
        "name": t["name"],
        "email": t["email"],
        "company_role": t.get("company_role", ""),
        "headline": t.get("headline", ""),
        "social_link": t.get("social_link", ""),
        "tags": t.get("tags", []),
        "consent": t.get("consent", True),
        "rating": t.get("rating"),
        "review": t["review"],
        "custom_answers": t.get("custom_answers", []),
        "status": t["status"],
        "featured": t.get("featured", False),
        "liked": t.get("liked", False),
        "created_at": t["created_at"].isoformat() if isinstance(t.get("created_at"), datetime) else str(t.get("created_at", "")),
        "updated_at": t["updated_at"].isoformat() if isinstance(t.get("updated_at"), datetime) else str(t.get("updated_at", "")),
    }
