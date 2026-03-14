# CLAUDE.md

## Project Overview

A GitHub Action that fetches CS internships from SimplifyJobs, filters for California/Remote-US positions, and posts new ones to a Discord webhook. Replaces an earlier 3,000-line Discord bot with a single ~150-line script. Zero npm dependencies — uses Node 20 built-in `fetch` and `fs`.

## Architecture

```
GitHub Actions (cron every 30 min)
  -> fetch SimplifyJobs listings.json
  -> filter: active, visible, CS category, CA/Remote-US
  -> diff against data/posted_ids.json
  -> POST new listings to Discord webhook (rich embeds, batches of 10)
  -> commit updated posted_ids.json
```

## Files

- **`.github/workflows/check-internships.yml`** — GitHub Actions workflow (cron + manual trigger)
- **`scripts/check-internships.js`** — The entire script. No dependencies.
- **`data/posted_ids.json`** — JSON array of already-posted listing IDs. Committed to repo by the Action.

## Running Locally

```bash
# Dry run (no posting)
node scripts/check-internships.js --dry-run

# Full run
DISCORD_WEBHOOK_URL="https://..." node scripts/check-internships.js
```

## Key Implementation Details

### Location Filtering
- **California**: Matches state name, "CA" abbreviation, or major city names (LA, SF, San Jose, etc.)
- **Remote-US**: Matches "Remote", "Remote in US", "Remote, CA", etc. Bare "Remote" is assumed US.
- **Excluded**: Canada ("CAN", Canadian cities), Global Remote, non-US countries

### Category Filtering
Only keeps: Software Engineering, Software, AI/ML/Data, Quantitative Finance, Quant

### State Tracking
`data/posted_ids.json` grows as new listings are posted. Stale IDs (listings no longer in SimplifyJobs) are pruned each run to prevent unbounded growth.

### Discord Webhook
Posts embeds in batches of 10 (Discord's limit per message). Handles 429 rate limits with retry. Embed fields: Title (linked), Company, Location, Type, Skills, Degrees.

### CC-Friendly Detection
If a listing's `degrees` array includes "Associate's", "CC-Friendly" is appended to the skills display.

## Environment Variables

- `DISCORD_WEBHOOK_URL` (required) — Discord webhook URL. Set as GitHub Actions secret.

## Data Source

SimplifyJobs listings.json: `https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json`

## Modifying Filters

- **Categories**: Edit `CS_CATEGORIES` set in `scripts/check-internships.js`
- **Location patterns**: Edit `CA_PATTERNS`, `isRemoteUS()`, and `isCanada()` in the same file
- **Posting frequency**: Edit the cron schedule in `.github/workflows/check-internships.yml`
