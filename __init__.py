from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
import psycopg2
from psycopg2.extras import RealDictCursor
from .config import Config

# Initialize Flask app
app = Flask(__name__, static_folder="../frontend", static_url_path="")
app.config.from_object(Config)

# Enable CORS
CORS(
    app,
    supports_credentials=True,
    expose_headers=["Authorization"],
    allow_headers=["Authorization", "Content-Type"]
)

# Initialize Bcrypt for password hashing
bcrypt = Bcrypt(app)

# Initialize JWT for token management
jwt = JWTManager(app)

# Connect to PostgreSQL
try:
    conn = psycopg2.connect(Config.DATABASE_URL, cursor_factory=RealDictCursor)
    cursor = conn.cursor()
    print("✅ Connected to the database successfully!")
except Exception as e:
    print("❌ Database connection failed:", str(e))

# Register Blueprints
from .auth import auth_bp
app.register_blueprint(auth_bp, url_prefix="/auth")


# Serve authentication page
@app.route("/")
def serve_auth_page():
    return send_from_directory(app.static_folder, "auth.html")

# Serve dashboard page
@app.route("/dashboard")
def serve_dashboard_page():
    return send_from_directory(app.static_folder, "dashboard.html")

