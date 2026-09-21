"""
Proofly — Flask Application Entry Point

This file:
  1. Creates the Flask app
  2. Loads configuration
  3. Initializes extensions (JWT, CORS, Rate Limiter)
  4. Registers all route blueprints
  5. Serves the frontend/ folder as static files (same origin as the API)
  6. Adds global error handlers

To run:
    python app.py

Then open: http://localhost:5000/login.html
"""

from flask import Flask, jsonify, send_from_directory
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os

from config import Config
from database import check_connection

# ── Import all route blueprints ────────────────────────────────────────────────
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.space_routes import space_bp
from routes.testimonial_routes import testimonial_bp
from routes.public_routes import public_bp
from routes.analytics_routes import analytics_bp
from routes.campaign_routes import campaign_bp

# Resolve the frontend directory path (sits alongside app.py)
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")


def create_app(config_overrides=None):
    """Application factory — creates and configures the Flask app."""

    # Serve frontend/ as static files at the root URL so that the API and
    # the UI share the same origin (localhost:5000).
    # This eliminates ALL CORS issues, cross-origin cookie blocking, and
    # broken absolute-path redirects like /dashboard.html.
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

    # ── Load configuration ─────────────────────────────────────────────────────
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    # ── Initialize extensions ──────────────────────────────────────────────────

    # JWT — handles token creation and verification
    jwt = JWTManager(app)

    # CORS — frontend and API are now same-origin (localhost:5000), but keep
    # CORS enabled with credentials so cookies work on all browsers.
    CORS(app, supports_credentials=True)

    # Rate Limiter — prevents brute-force attacks
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per hour"],
        storage_uri="memory://",
        enabled=app.config.get("RATELIMIT_ENABLED", True),
    )

    # Apply stricter limits to auth endpoints if enabled
    if app.config.get("RATELIMIT_ENABLED", True):
        limiter.limit("10 per minute")(auth_bp)

    # ── Register blueprints ────────────────────────────────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(space_bp)
    app.register_blueprint(testimonial_bp)
    app.register_blueprint(public_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(campaign_bp)

    # ── Serve the frontend ─────────────────────────────────────────────────────

    @app.route("/")
    def index():
        """Serve the landing page."""
        return send_from_directory(FRONTEND_DIR, "index.html")

    # ── Global error handlers ──────────────────────────────────────────────────

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "message": "Endpoint not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"success": False, "message": "Method not allowed."}), 405

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({"success": False, "message": "Too many requests. Please slow down."}), 429

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"success": False, "message": "Internal server error."}), 500

    # ── JWT error handlers ─────────────────────────────────────────────────────

    @jwt.unauthorized_loader
    def unauthorized(reason):
        return jsonify({"success": False, "message": "Authentication required."}), 401

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_data):
        return jsonify({"success": False, "message": "Token has expired."}), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify({"success": False, "message": "Invalid token."}), 401

    # ── Health check ───────────────────────────────────────────────────────────

    @app.route("/api/health")
    def health():
        """Simple health check — confirms Flask and MongoDB are both running."""
        db_ok = check_connection()
        return jsonify({
            "status": "ok" if db_ok else "degraded",
            "flask": True,
            "mongodb": db_ok,
        }), 200 if db_ok else 503

    return app


# ── Run the application ────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = create_app()
    print("\n>> Proofly is running!")
    print(">> Open in browser: http://localhost:5000/login.html")
    print(">> Health check:    http://localhost:5000/api/health\n")
    app.run(debug=Config.DEBUG, port=5000, use_reloader=False)
