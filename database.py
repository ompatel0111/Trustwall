"""
Proofly — MongoDB connection module.

All database operations go through the `db` object defined here.
We use PyMongo directly — no ORM, no abstraction layer.
"""

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from config import Config

# Create a single MongoClient instance (shared across the whole app)
client = MongoClient(Config.MONGO_URI)

# The main database
db = client.get_database()


def check_connection():
    """Ping MongoDB to verify the connection is alive."""
    try:
        client.admin.command("ping")
        return True
    except ConnectionFailure:
        return False


def get_db():
    """Return the database instance."""
    return db

