# SMC CS Club Opportunities Bot

A GitHub Action that automatically discovers CS internships and posts them to a Discord channel via webhook. Runs every 30 minutes, filters for California and Remote-US positions, and tracks what's already been posted.

## How It Works

```
GitHub Actions (cron every 30 min)
  -> Fetch SimplifyJobs listings.json (~10MB, thousands of internships)
  -> Filter: active, visible, CS category, CA or Remote-US location
  -> Diff against data/posted_ids.json (already-posted listings)
  -> POST new listings to Discord webhook as rich embeds
  -> Commit updated posted_ids.json back to repo
```

## Setup

### 1. Create a Discord Webhook

1. In your Discord server, go to **Channel Settings > Integrations > Webhooks**
2. Click **New Webhook**, name it something like "CS Internships"
3. Copy the webhook URL

### 2. Add GitHub Secret

1. Go to your repo's **Settings > Secrets and variables > Actions**
2. Add a new secret: `DISCORD_WEBHOOK_URL` with the webhook URL from step 1

### 3. Enable the Action

The workflow runs automatically every 30 minutes. You can also trigger it manually:

1. Go to **Actions** tab
2. Select **Check Internships**
3. Click **Run workflow**

## Local Testing

```bash
# Dry run (fetches and filters, but doesn't post to Discord)
node scripts/check-internships.js --dry-run

# Full run (requires DISCORD_WEBHOOK_URL env var)
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." node scripts/check-internships.js
```

## Filters

**Categories kept**: Software Engineering, Software, AI/ML/Data, Quantitative Finance

**Locations kept**:
- California (by state name, abbreviation, or major city)
- Remote-US (various formats like "Remote", "Remote in CA", "Remote, United States")

**Excluded**: Canada, Global Remote, non-US countries

## State Tracking

`data/posted_ids.json` stores IDs of already-posted listings. Each run:
1. Appends new IDs after posting
2. Prunes IDs that no longer exist in SimplifyJobs (keeps the file from growing forever)
3. Commits the updated file back to the repo

## Files

```
CSclubOpportunitiesBot/
├── .github/workflows/check-internships.yml   # GitHub Actions workflow
├── scripts/check-internships.js              # The entire bot (~150 lines)
├── data/posted_ids.json                      # State: which listings have been posted
├── CLAUDE.md                                 # Claude Code instructions
├── README.md                                 # This file
└── LICENSE                                   # MIT
```

## License

MIT
