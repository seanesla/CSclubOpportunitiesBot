-- SMC CS Opportunities Bot Database Schema
-- For use with Turso (libSQL)

-- ===== Opportunities Table =====
-- Stores all fetched and processed opportunities
CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,  -- greenhouse, lever, ashby, usajobs, mlh
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('internship', 'hackathon', 'event')),
    workplace_type TEXT CHECK(workplace_type IN ('on-site', 'hybrid', 'remote')),

    -- Location data
    location_text TEXT,
    lat REAL,
    lon REAL,
    distance_km REAL,
    is_california INTEGER DEFAULT 0,  -- Boolean: is in California or remote-US

    -- URLs and dates
    url TEXT NOT NULL,
    deadline TEXT,  -- ISO 8601 date
    posted_at TEXT,  -- ISO 8601 datetime

    -- Description and analysis
    description_raw TEXT,
    description_preview TEXT,  -- First 200 chars
    skills TEXT,  -- JSON array of detected skills
    compensation TEXT,  -- Detected compensation info
    cc_friendly INTEGER DEFAULT 1,  -- Default: assume friendly unless flagged
    cc_exclusion_reason TEXT,  -- Why it's not CC-friendly (if cc_friendly = 0)

    -- Tracking
    first_seen TEXT NOT NULL,  -- ISO 8601 datetime
    last_seen TEXT NOT NULL,  -- ISO 8601 datetime
    hash TEXT NOT NULL,  -- Deduplication hash
    score REAL DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(source, source_id)
);

-- ===== Posts Table =====
-- Tracks what opportunities have been posted to Discord
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id TEXT NOT NULL,
    posted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    discord_message_id TEXT,
    channel_id TEXT,

    FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
);

-- ===== Geocode Cache Table =====
-- Caches geocoding results to minimize API calls
CREATE TABLE IF NOT EXISTS geocode_cache (
    location_text TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    is_california INTEGER DEFAULT 0,
    cached_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== Sources Table =====
-- Tracks API source fetch history and errors
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,  -- greenhouse, lever, ashby, usajobs, mlh
    source_key TEXT NOT NULL,  -- Company name or identifier
    last_fetched TEXT,  -- ISO 8601 datetime
    fetch_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_success_count INTEGER DEFAULT 0,  -- How many opportunities found last time

    UNIQUE(source_type, source_key)
);

-- ===== Settings Table =====
-- Runtime configuration overrides
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== Indexes for Performance =====

-- Opportunities indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_type
    ON opportunities(type);

CREATE INDEX IF NOT EXISTS idx_opportunities_is_california
    ON opportunities(is_california);

CREATE INDEX IF NOT EXISTS idx_opportunities_hash
    ON opportunities(hash);

CREATE INDEX IF NOT EXISTS idx_opportunities_score
    ON opportunities(score DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_first_seen
    ON opportunities(first_seen DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_source
    ON opportunities(source, source_id);

-- Posts indexes
CREATE INDEX IF NOT EXISTS idx_posts_opportunity
    ON posts(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_posts_posted_at
    ON posts(posted_at DESC);

-- CRITICAL: Prevent duplicate posts to same channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_unique_per_channel
    ON posts(opportunity_id, channel_id);

-- Sources indexes
CREATE INDEX IF NOT EXISTS idx_sources_type_key
    ON sources(source_type, source_key);

CREATE INDEX IF NOT EXISTS idx_sources_last_fetched
    ON sources(last_fetched DESC);

-- Geocode cache indexes
CREATE INDEX IF NOT EXISTS idx_geocode_cached_at
    ON geocode_cache(cached_at DESC);
