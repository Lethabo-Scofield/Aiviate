import uuid
import traceback

from flask import request, jsonify, g

from routes import community_bp
from middleware import require_auth
from models import CommunityPost, User
from utils import get_db_session

MAX_BODY = 1000
DRIVER_CATEGORIES = {"general", "road", "safety"}
# Dispatchers can also post company-wide notices to drivers.
ADMIN_CATEGORIES = DRIVER_CATEGORIES | {"notice"}


def _author_name(db):
    user = db.query(User).filter(User.id == g.user_id).first()
    return (user.name if user else None) or g.user_email or "Team member"


def _thread(post, replies):
    data = post.to_dict()
    data["replies"] = [r.to_dict() for r in replies]
    data["can_delete"] = _can_delete(post)
    for reply, out in zip(replies, data["replies"]):
        out["can_delete"] = _can_delete(reply)
    return data


def _can_delete(post):
    return post.author_user_id == g.user_id or g.user_role == "admin"


@community_bp.route("/api/community/posts", methods=["GET"])
@require_auth
def list_posts():
    db = get_db_session()
    try:
        limit = min(max(int(request.args.get("limit", 50)), 1), 100)
        posts = db.query(CommunityPost).filter(
            CommunityPost.company_id == g.company_id,
            CommunityPost.parent_id.is_(None),
        ).order_by(CommunityPost.created_at.desc()).limit(limit).all()

        replies_by_parent = {p.id: [] for p in posts}
        if posts:
            replies = db.query(CommunityPost).filter(
                CommunityPost.company_id == g.company_id,
                CommunityPost.parent_id.in_(list(replies_by_parent)),
            ).order_by(CommunityPost.created_at.asc()).all()
            for reply in replies:
                replies_by_parent[reply.parent_id].append(reply)

        return jsonify({"posts": [_thread(p, replies_by_parent[p.id]) for p in posts]})
    finally:
        db.close()


@community_bp.route("/api/community/posts", methods=["POST"])
@require_auth
def create_post():
    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()
    category = (data.get("category") or "general").strip().lower()
    parent_id = data.get("parent_id") or None

    if not body:
        return jsonify({"error": "Write something before posting"}), 400
    if len(body) > MAX_BODY:
        return jsonify({"error": f"Posts can be at most {MAX_BODY} characters"}), 400
    allowed = ADMIN_CATEGORIES if g.user_role == "admin" else DRIVER_CATEGORIES
    if category not in allowed:
        return jsonify({"error": "That post type isn't available to you"}), 400

    db = get_db_session()
    try:
        if parent_id:
            parent = db.query(CommunityPost).filter(
                CommunityPost.id == parent_id,
                CommunityPost.company_id == g.company_id,
            ).first()
            if not parent:
                return jsonify({"error": "Post not found"}), 404
            if parent.parent_id:
                # Replies stay one level deep; reply to the thread instead.
                parent_id = parent.parent_id
            category = parent.category

        post = CommunityPost(
            id=f"CPOST-{uuid.uuid4().hex[:10].upper()}",
            company_id=g.company_id,
            parent_id=parent_id,
            author_user_id=g.user_id,
            author_name=_author_name(db),
            author_role=g.user_role,
            category=category,
            body=body,
        )
        db.add(post)
        db.commit()
        db.refresh(post)
        return jsonify({"success": True, "post": _thread(post, [])}), 201
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Could not save your post"}), 500
    finally:
        db.close()


@community_bp.route("/api/community/posts/<post_id>", methods=["DELETE"])
@require_auth
def delete_post(post_id):
    db = get_db_session()
    try:
        post = db.query(CommunityPost).filter(
            CommunityPost.id == post_id,
            CommunityPost.company_id == g.company_id,
        ).first()
        if not post:
            return jsonify({"error": "Post not found"}), 404
        if not _can_delete(post):
            return jsonify({"error": "You can only delete your own posts"}), 403
        db.query(CommunityPost).filter(
            CommunityPost.company_id == g.company_id,
            CommunityPost.parent_id == post.id,
        ).delete(synchronize_session=False)
        db.delete(post)
        db.commit()
        return jsonify({"success": True})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Could not delete the post"}), 500
    finally:
        db.close()
