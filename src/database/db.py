"""
Database schema and connection management for the SMC CS Opportunities Bot.

Manages SQLite database with tables for:
- opportunities: All fetched and processed opportunities
- posts: Discord posting history
- sources: API source tracking
- settings: Bot configuration overrides
- geocode_cache: Cached location coordinates
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

from src.utils.config import get_config
from src.utils.logger import get_logger

logger = get_logger(__name__)


class Database:
    """Database connection and schema management."""

    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize database connection.

        Args:
            db_path: Path to SQLite database file. If None, uses config value.
        """
        config = get_config()
        self.db_path = db_path or config.database_path

        # Ensure database directory exists
        db_dir = Path(self.db_path).parent
        if not db_dir.exists():
            db_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Database initialized at: {self.db_path}")

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """
        Context manager for database connections.

        Yields:
            SQLite connection with row factory enabled
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            conn.close()

    def init_schema(self):
        """Create all database tables if they don't exist."""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Opportunities table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS opportunities (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    company TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('internship', 'hackathon', 'event')),
                    workplace_type TEXT CHECK(workplace_type IN ('on-site', 'hybrid', 'remote', NULL)),
                    location_text TEXT,
                    lat REAL,
                    lon REAL,
                    distance_km REAL,
                    is_local INTEGER DEFAULT 0,
                    url TEXT NOT NULL,
                    deadline TEXT,
                    posted_at TEXT,
                    description_raw TEXT,
                    summary_bullets TEXT,
                    cc_friendly INTEGER DEFAULT 0,
                    cc_reason TEXT,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    hash TEXT NOT NULL,
                    score REAL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(source, source_id)
                )
            """)

            # Create indexes for common queries
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_opportunities_type
                ON opportunities(type)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_opportunities_is_local
                ON opportunities(is_local)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_opportunities_hash
                ON opportunities(hash)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_opportunities_score
                ON opportunities(score DESC)
            """)

            # Posts table (tracking what's been posted to Discord)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    opportunity_id TEXT NOT NULL,
                    posted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    discord_message_id TEXT,
                    channel_id TEXT,
                    FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_posts_opportunity
                ON posts(opportunity_id)
            """)

            # Sources table (tracking API sources and fetch history)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_type TEXT NOT NULL,
                    source_key TEXT NOT NULL,
                    last_fetched TEXT,
                    fetch_count INTEGER DEFAULT 0,
                    last_error TEXT,
                    UNIQUE(source_type, source_key)
                )
            """)

            # Settings table (runtime configuration overrides)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Geocode cache table (to respect OSM rate limits)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS geocode_cache (
                    location_text TEXT PRIMARY KEY,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    cached_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            conn.commit()
            logger.info("Database schema initialized successfully")

    def drop_all_tables(self):
        """
        Drop all tables (for testing/reset purposes).

        WARNING: This deletes all data!
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Get all table names
            cursor.execute("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            """)

            tables = cursor.fetchall()

            for table in tables:
                table_name = table[0]
                cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
                logger.warning(f"Dropped table: {table_name}")

            conn.commit()
            logger.warning("All tables dropped")

    def vacuum(self):
        """Optimize database (reclaim space after deletions)."""
        with self.get_connection() as conn:
            conn.execute("VACUUM")
            logger.info("Database vacuumed")

    def get_stats(self) -> dict:
        """
        Get database statistics.

        Returns:
            Dictionary with table row counts
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()

            stats = {}

            # Count opportunities
            cursor.execute("SELECT COUNT(*) FROM opportunities")
            stats["opportunities"] = cursor.fetchone()[0]

            # Count posts
            cursor.execute("SELECT COUNT(*) FROM posts")
            stats["posts"] = cursor.fetchone()[0]

            # Count sources
            cursor.execute("SELECT COUNT(*) FROM sources")
            stats["sources"] = cursor.fetchone()[0]

            # Count geocode cache entries
            cursor.execute("SELECT COUNT(*) FROM geocode_cache")
            stats["geocode_cache"] = cursor.fetchone()[0]

            # Count by type
            cursor.execute("""
                SELECT type, COUNT(*)
                FROM opportunities
                GROUP BY type
            """)
            stats["by_type"] = dict(cursor.fetchall())

            # Count posted vs unposted
            cursor.execute("""
                SELECT
                    COUNT(DISTINCT o.id) as total,
                    COUNT(DISTINCT p.opportunity_id) as posted
                FROM opportunities o
                LEFT JOIN posts p ON o.id = p.opportunity_id
            """)
            row = cursor.fetchone()
            stats["posted"] = row[1]
            stats["unposted"] = row[0] - row[1]

            return stats


# Global database instance
_db_instance: Optional[Database] = None


def get_database() -> Database:
    """
    Get or create the global database instance.

    Returns:
        Database instance
    """
    global _db_instance

    if _db_instance is None:
        _db_instance = Database()

    return _db_instance


def init_database():
    """Initialize database schema (create tables)."""
    db = get_database()
    db.init_schema()


if __name__ == "__main__":
    import sys

    # CLI for database management
    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "init":
            print("Initializing database schema...")
            init_database()
            print("✓ Database schema created")

        elif command == "stats":
            db = get_database()
            stats = db.get_stats()

            print("\n=== Database Statistics ===")
            print(f"Total opportunities: {stats['opportunities']}")
            print(f"  - Posted: {stats['posted']}")
            print(f"  - Unposted: {stats['unposted']}")
            print(f"\nBy type:")
            for opp_type, count in stats.get('by_type', {}).items():
                print(f"  - {opp_type}: {count}")
            print(f"\nTotal posts: {stats['posts']}")
            print(f"Sources tracked: {stats['sources']}")
            print(f"Geocode cache size: {stats['geocode_cache']}")

        elif command == "reset":
            confirm = input("WARNING: This will delete ALL data. Are you sure? (yes/no): ")
            if confirm.lower() == "yes":
                db = get_database()
                db.drop_all_tables()
                db.init_schema()
                print("✓ Database reset complete")
            else:
                print("Reset cancelled")

        elif command == "vacuum":
            print("Vacuuming database...")
            db = get_database()
            db.vacuum()
            print("✓ Database optimized")

        else:
            print(f"Unknown command: {command}")
            print("\nAvailable commands:")
            print("  init   - Initialize database schema")
            print("  stats  - Show database statistics")
            print("  reset  - Drop all tables and reinitialize")
            print("  vacuum - Optimize database")

    else:
        print("Usage: python -m src.database.db <command>")
        print("\nCommands:")
        print("  init   - Initialize database schema")
        print("  stats  - Show database statistics")
        print("  reset  - Drop all tables and reinitialize")
        print("  vacuum - Optimize database")
