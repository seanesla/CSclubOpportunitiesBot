"""
CRUD operations for the SMC CS Opportunities Bot database.

Provides functions for inserting, querying, updating, and deleting
opportunities, posts, and cache entries.
"""

from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from src.database.db import get_database
from src.database.models import GeocodeCache, Opportunity, Post, Source
from src.utils.config import get_config
from src.utils.logger import get_logger

logger = get_logger(__name__)


# ===== Opportunity Operations =====

def insert_opportunity(opp: Opportunity) -> bool:
    """
    Insert a new opportunity into the database.

    Args:
        opp: Opportunity object to insert

    Returns:
        True if inserted successfully, False if already exists
    """
    db = get_database()

    try:
        with db.get_connection() as conn:
            cursor = conn.cursor()

            opp_dict = opp.to_dict()

            cursor.execute(
                """
                INSERT INTO opportunities (
                    id, source, source_id, title, company, type, workplace_type,
                    location_text, lat, lon, distance_km, is_local, url, deadline,
                    posted_at, description_raw, summary_bullets, cc_friendly,
                    cc_reason, first_seen, last_seen, hash, score, created_at
                ) VALUES (
                    :id, :source, :source_id, :title, :company, :type, :workplace_type,
                    :location_text, :lat, :lon, :distance_km, :is_local, :url, :deadline,
                    :posted_at, :description_raw, :summary_bullets, :cc_friendly,
                    :cc_reason, :first_seen, :last_seen, :hash, :score, :created_at
                )
                """,
                opp_dict,
            )

            logger.debug(f"Inserted opportunity: {opp.title} at {opp.company}")
            return True

    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            logger.debug(f"Opportunity already exists: {opp.source}/{opp.source_id}")
            return False
        else:
            logger.error(f"Error inserting opportunity: {e}")
            raise


def update_opportunity(opp: Opportunity) -> bool:
    """
    Update an existing opportunity.

    Args:
        opp: Opportunity object with updated data

    Returns:
        True if updated successfully
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        opp_dict = opp.to_dict()

        cursor.execute(
            """
            UPDATE opportunities SET
                title = :title,
                company = :company,
                workplace_type = :workplace_type,
                location_text = :location_text,
                lat = :lat,
                lon = :lon,
                distance_km = :distance_km,
                is_local = :is_local,
                url = :url,
                deadline = :deadline,
                posted_at = :posted_at,
                description_raw = :description_raw,
                summary_bullets = :summary_bullets,
                cc_friendly = :cc_friendly,
                cc_reason = :cc_reason,
                last_seen = :last_seen,
                score = :score
            WHERE id = :id
            """,
            opp_dict,
        )

        logger.debug(f"Updated opportunity: {opp.id}")
        return True


def get_opportunity_by_id(opp_id: str) -> Optional[Opportunity]:
    """
    Retrieve an opportunity by ID.

    Args:
        opp_id: Opportunity ID

    Returns:
        Opportunity object or None if not found
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM opportunities WHERE id = ?",
            (opp_id,),
        )

        row = cursor.fetchone()

        if row:
            return Opportunity.from_row(row)
        return None


def get_opportunity_by_source(source: str, source_id: str) -> Optional[Opportunity]:
    """
    Retrieve an opportunity by source and source ID.

    Args:
        source: Source type (e.g., "greenhouse")
        source_id: ID from the source

    Returns:
        Opportunity object or None if not found
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM opportunities WHERE source = ? AND source_id = ?",
            (source, source_id),
        )

        row = cursor.fetchone()

        if row:
            return Opportunity.from_row(row)
        return None


def get_unposted_opportunities(limit: Optional[int] = None) -> List[Opportunity]:
    """
    Get all opportunities that haven't been posted to Discord yet,
    ordered by score (highest first).

    Args:
        limit: Maximum number of opportunities to return

    Returns:
        List of Opportunity objects
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        query = """
            SELECT o.*
            FROM opportunities o
            LEFT JOIN posts p ON o.id = p.opportunity_id
            WHERE p.opportunity_id IS NULL
            ORDER BY o.score DESC, o.first_seen DESC
        """

        if limit:
            query += f" LIMIT {limit}"

        cursor.execute(query)

        rows = cursor.fetchall()

        return [Opportunity.from_row(row) for row in rows]


def get_opportunities_by_hash(hash_value: str) -> List[Opportunity]:
    """
    Get all opportunities with a specific deduplication hash.

    Args:
        hash_value: Hash to search for

    Returns:
        List of matching Opportunity objects
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM opportunities WHERE hash = ?",
            (hash_value,),
        )

        rows = cursor.fetchall()

        return [Opportunity.from_row(row) for row in rows]


def delete_old_opportunities(days: int = 90) -> int:
    """
    Delete opportunities older than specified days.

    Args:
        days: Delete opportunities with first_seen older than this many days

    Returns:
        Number of opportunities deleted
    """
    db = get_database()
    cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "DELETE FROM opportunities WHERE first_seen < ?",
            (cutoff_date,),
        )

        deleted_count = cursor.rowcount
        logger.info(f"Deleted {deleted_count} old opportunities (older than {days} days)")

        return deleted_count


# ===== Post Operations =====

def insert_post(post: Post) -> int:
    """
    Record that an opportunity was posted to Discord.

    Args:
        post: Post object with opportunity_id and optional message details

    Returns:
        ID of the inserted post record
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        post_dict = post.to_dict()

        cursor.execute(
            """
            INSERT INTO posts (
                opportunity_id, posted_at, discord_message_id, channel_id
            ) VALUES (
                :opportunity_id, :posted_at, :discord_message_id, :channel_id
            )
            """,
            post_dict,
        )

        post_id = cursor.lastrowid
        logger.debug(f"Recorded post for opportunity: {post.opportunity_id}")

        return post_id


def mark_as_posted(opportunity_id: str, discord_message_id: Optional[str] = None) -> int:
    """
    Mark an opportunity as posted (convenience function).

    Args:
        opportunity_id: ID of the opportunity
        discord_message_id: Optional Discord message ID

    Returns:
        ID of the inserted post record
    """
    post = Post(
        opportunity_id=opportunity_id,
        discord_message_id=discord_message_id,
    )

    return insert_post(post)


def is_posted(opportunity_id: str) -> bool:
    """
    Check if an opportunity has been posted to Discord.

    Args:
        opportunity_id: ID of the opportunity

    Returns:
        True if posted, False otherwise
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT 1 FROM posts WHERE opportunity_id = ? LIMIT 1",
            (opportunity_id,),
        )

        return cursor.fetchone() is not None


# ===== Geocode Cache Operations =====

def get_cached_geocode(location_text: str) -> Optional[Tuple[float, float]]:
    """
    Get cached geocoding result for a location.

    Args:
        location_text: Location string (e.g., "Los Angeles, CA")

    Returns:
        Tuple of (lat, lon) if cached, None otherwise
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT lat, lon FROM geocode_cache WHERE location_text = ?",
            (location_text,),
        )

        row = cursor.fetchone()

        if row:
            return (row[0], row[1])
        return None


def cache_geocode(location_text: str, lat: float, lon: float) -> bool:
    """
    Cache a geocoding result.

    Args:
        location_text: Location string
        lat: Latitude
        lon: Longitude

    Returns:
        True if cached successfully
    """
    db = get_database()

    try:
        with db.get_connection() as conn:
            cursor = conn.cursor()

            cache = GeocodeCache(
                location_text=location_text,
                lat=lat,
                lon=lon,
            )

            cache_dict = cache.to_dict()

            cursor.execute(
                """
                INSERT OR REPLACE INTO geocode_cache (
                    location_text, lat, lon, cached_at
                ) VALUES (
                    :location_text, :lat, :lon, :cached_at
                )
                """,
                cache_dict,
            )

            logger.debug(f"Cached geocode for: {location_text}")
            return True

    except Exception as e:
        logger.error(f"Error caching geocode: {e}")
        return False


# ===== Source Tracking Operations =====

def update_source_fetch(source_type: str, source_key: str, success: bool, error: Optional[str] = None):
    """
    Update source fetch history.

    Args:
        source_type: Type of source (e.g., "greenhouse")
        source_key: Source identifier (e.g., company name)
        success: Whether the fetch was successful
        error: Optional error message if fetch failed
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        # Check if source exists
        cursor.execute(
            "SELECT fetch_count FROM sources WHERE source_type = ? AND source_key = ?",
            (source_type, source_key),
        )

        row = cursor.fetchone()

        if row:
            # Update existing source
            new_count = row[0] + 1
            cursor.execute(
                """
                UPDATE sources SET
                    last_fetched = ?,
                    fetch_count = ?,
                    last_error = ?
                WHERE source_type = ? AND source_key = ?
                """,
                (datetime.utcnow().isoformat(), new_count, error, source_type, source_key),
            )
        else:
            # Insert new source
            cursor.execute(
                """
                INSERT INTO sources (source_type, source_key, last_fetched, fetch_count, last_error)
                VALUES (?, ?, ?, 1, ?)
                """,
                (source_type, source_key, datetime.utcnow().isoformat(), error),
            )

        logger.debug(f"Updated source fetch: {source_type}/{source_key}")


# ===== Utility Functions =====

def get_all_hashes() -> set:
    """
    Get all opportunity hashes (for deduplication).

    Returns:
        Set of all hash values in database
    """
    db = get_database()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT DISTINCT hash FROM opportunities")

        rows = cursor.fetchall()

        return {row[0] for row in rows}


if __name__ == "__main__":
    # Test CRUD operations
    from datetime import datetime

    print("=== Testing CRUD Operations ===\n")

    # Initialize database
    from src.database.db import init_database

    init_database()

    # Create a test opportunity
    test_opp = Opportunity(
        source="test",
        source_id="test123",
        title="Test Internship",
        company="Test Company",
        type="internship",
        url="https://example.com",
        first_seen=datetime.utcnow().isoformat(),
        last_seen=datetime.utcnow().isoformat(),
        hash="test_hash_123",
    )

    # Test insert
    print("Inserting test opportunity...")
    result = insert_opportunity(test_opp)
    print(f"  Insert result: {result}")

    # Test retrieve
    print("\nRetrieving opportunity by ID...")
    retrieved = get_opportunity_by_id(test_opp.id)
    if retrieved:
        print(f"  Found: {retrieved.title} at {retrieved.company}")

    # Test unposted query
    print("\nQuerying unposted opportunities...")
    unposted = get_unposted_opportunities(limit=5)
    print(f"  Found {len(unposted)} unposted opportunities")

    # Test post tracking
    print("\nMarking as posted...")
    mark_as_posted(test_opp.id)
    print(f"  Is posted: {is_posted(test_opp.id)}")

    # Test geocode cache
    print("\nTesting geocode cache...")
    cache_geocode("Test City, CA", 34.0, -118.0)
    cached = get_cached_geocode("Test City, CA")
    print(f"  Cached coordinates: {cached}")

    print("\n✓ All CRUD operations working")
