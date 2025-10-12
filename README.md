# SMC CS Club Opportunities Bot

A Discord bot that automatically discovers, filters, and posts computer science internships, hackathons, and tech opportunities specifically for **Santa Monica College (SMC)** students. Posts curated opportunities once every 3 days to your Discord server.

## 🎯 Core Philosophy

- **Local-First for Internships**: Prioritizes opportunities within 40 miles of SMC campus (Santa Monica/LA area)
- **Quality over Quantity**: Posts 5-8 carefully selected opportunities every 3 days
- **No Spam**: Strict posting schedule prevents channel overload
- **CC-Friendly**: Filters for opportunities accepting community college students
- **Verified Sources Only**: Uses official APIs from trusted sources (no web scraping)

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     SCHEDULED TRIGGER                        │
│              (Every 3 days via GitHub Actions)               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATA FETCHERS (Sources)                    │
├─────────────────────────────────────────────────────────────┤
│  • Greenhouse Job Board API (LA-area companies)             │
│  • Lever Postings API (startups)                            │
│  • Ashby Job Postings API (modern ATS)                      │
│  • USAJOBS API (federal/local government)                   │
│  • MLH API (curated collegiate hackathons)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  DATA PROCESSING PIPELINE                    │
├─────────────────────────────────────────────────────────────┤
│  1. Normalize to common schema                              │
│  2. Geocode locations (with caching)                        │
│  3. Calculate distance from SMC (34.0168, -118.4695)        │
│  4. Filter by distance/type rules                           │
│  5. LLM classify & summarize (OpenAI Structured Outputs)    │
│  6. Deduplicate (by company + title + location)             │
│  7. Score & rank opportunities                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQLite DATABASE                           │
├─────────────────────────────────────────────────────────────┤
│  • opportunities (all fetched items with metadata)          │
│  • posts (Discord posting history)                          │
│  • sources (API configurations)                             │
│  • settings (bot configuration)                             │
│  • geocode_cache (city → lat/lon mappings)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  DISCORD WEBHOOK POSTER                      │
├─────────────────────────────────────────────────────────────┤
│  • Formats opportunities as rich embeds                     │
│  • Posts top 5-8 new items                                  │
│  • Includes: company, location, distance, deadline          │
│  • 2-3 bullet summary "Why SMC students should care"        │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Data Schema

### Normalized Opportunity Schema

```python
{
    "id": "uuid",
    "source": "greenhouse|lever|ashby|usajobs|mlh",
    "source_id": "unique_id_from_source",
    "title": "Software Engineering Intern",
    "company": "Riot Games",
    "type": "internship|hackathon|event",
    "workplace_type": "on-site|hybrid|remote|null",
    "location_text": "Los Angeles, CA",
    "lat": 34.0522,
    "lon": -118.2437,
    "distance_km": 13.2,
    "is_local": true,
    "url": "https://...",
    "deadline": "2025-11-03",
    "posted_at": "2025-10-12",
    "description_raw": "...",
    "summary_bullets": ["bullet1", "bullet2", "bullet3"],
    "cc_friendly": true,
    "cc_reason": "Accepts undergrads; no specific degree requirement mentioned",
    "first_seen": "2025-10-12T10:00:00Z",
    "last_seen": "2025-10-12T10:00:00Z"
}
```

## 🎯 Filtering Rules

### Internships
- **Distance**: ≤ 40 miles (64.4 km) from SMC campus **OR** fully remote (US-based)
- **Location**: Santa Monica College main campus at `34.0168, -118.4695` (1900 Pico Blvd)
- **Commitment**: Must be intern/co-op positions
- **CC-Friendly**: Prefer opportunities accepting community college students

### Hackathons
- **Prestige**: MLH member events **OR** whitelisted events (HackMIT, PennApps, etc.)
- **Location**: Any location (national scope allowed for prestigious hackathons)
- **Type**: In-person, hybrid, or virtual collegiate hackathons

### Posting Policy
- **Frequency**: Once every 3 days (72 hours)
- **Volume**: 5-8 new opportunities per post
- **Deduplication**: Hash by `(company, normalized_title, city)`
- **Verification**: Only post items with valid source URLs (never hallucinate)

## 🔧 Technology Stack

### Core
- **Python 3.8+**: Main language
- **SQLite3**: Local database (built-in)
- **requests**: HTTP client for API calls
- **openai**: LLM for classification/summarization (Structured Outputs)
- **python-dotenv**: Environment variable management

### APIs Used
- **Greenhouse Job Board API**: LA-area tech companies
- **Lever Postings API**: Startup positions
- **Ashby Job Postings API**: Modern ATS jobs
- **USAJOBS API**: Government internships
- **MLH API**: Collegiate hackathons
- **Discord Webhooks**: Message posting
- **OpenAI API**: GPT-4o for text analysis (Structured Outputs)

### Deployment
- **GitHub Actions**: Scheduled cron job (every 3 days)
- **Alternative**: Cloudflare Workers Cron, Vercel Cron, etc.

## 📁 Project Structure

```
CSclubOpportunitiesBot/
├── README.md                      # This file
├── .env.example                   # Example environment variables
├── .env                          # Your secrets (gitignored)
├── .gitignore                    # Git ignore rules
├── requirements.txt              # Python dependencies
├── config/
│   ├── sources.yaml              # API source configurations
│   ├── watchlist.yaml            # Company watchlist for ATS APIs
│   └── prestige_hackathons.yaml  # Whitelisted hackathon names
├── src/
│   ├── __init__.py
│   ├── main.py                   # Main orchestrator script
│   ├── fetchers/
│   │   ├── __init__.py
│   │   ├── greenhouse.py         # Greenhouse API client
│   │   ├── lever.py              # Lever API client
│   │   ├── ashby.py              # Ashby API client
│   │   ├── usajobs.py            # USAJOBS API client
│   │   └── mlh.py                # MLH hackathons fetcher
│   ├── processing/
│   │   ├── __init__.py
│   │   ├── normalizer.py         # Data normalization
│   │   ├── geocoder.py           # Geocoding service
│   │   ├── distance.py           # Haversine distance calculation
│   │   ├── classifier.py         # LLM classification (OpenAI)
│   │   ├── deduplicator.py       # Deduplication logic
│   │   └── scorer.py             # Scoring & ranking
│   ├── database/
│   │   ├── __init__.py
│   │   ├── db.py                 # Database connection & setup
│   │   ├── models.py             # Data models
│   │   └── queries.py            # CRUD operations
│   ├── discord/
│   │   ├── __init__.py
│   │   ├── webhook.py            # Webhook poster
│   │   └── embeds.py             # Embed formatters
│   └── utils/
│       ├── __init__.py
│       ├── config.py             # Configuration loader
│       └── logger.py             # Logging setup
├── data/
│   └── opportunities.db          # SQLite database (gitignored)
├── logs/
│   └── bot.log                   # Application logs (gitignored)
├── tests/
│   ├── __init__.py
│   ├── test_fetchers.py
│   ├── test_processing.py
│   ├── test_database.py
│   └── test_discord.py
└── .github/
    └── workflows/
        └── scheduled_post.yml    # GitHub Actions workflow
```

## 🚀 Setup Instructions

### 1. Prerequisites

- Python 3.8 or higher
- Git
- Discord server with webhook URL
- OpenAI API key
- USAJOBS API key (free, requires email registration)

### 2. Clone & Install

```bash
# Clone the repository
git clone https://github.com/yourusername/CSclubOpportunitiesBot.git
cd CSclubOpportunitiesBot

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# OpenAI API
OPENAI_API_KEY=sk-...

# Discord Webhook
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# USAJOBS API
USAJOBS_API_KEY=your-usajobs-api-key
USAJOBS_USER_AGENT=your-email@example.com

# Nominatim Geocoding (OpenStreetMap)
NOMINATIM_USER_AGENT=SMC-CS-Opportunities-Bot/1.0 (your-email@example.com)

# Optional: Rate limiting
RATE_LIMIT_DELAY_SECONDS=1

# Optional: Override posting schedule (for testing)
# MAX_OPPORTUNITIES_PER_POST=8
```

### 4. Configure Sources

Edit `config/watchlist.yaml` with LA-area companies you want to track:

```yaml
greenhouse:
  - riotgames
  - snapinc
  - goodrx
  - ziprecruiter
  - bird

lever:
  - netflix
  - tinder
  - spotify

ashby:
  # Add Ashby organization slugs here
```

Edit `config/prestige_hackathons.yaml` for whitelisted hackathons:

```yaml
whitelisted:
  - HackMIT
  - PennApps
  - TreeHacks
  - HackTech
  - LA Hacks
  - CalHacks
```

### 5. Initialize Database

```bash
python -m src.database.db init
```

This creates the SQLite database with all required tables.

### 6. Test Run (Manual)

```bash
# Dry run (fetch and process, but don't post to Discord)
python src/main.py --dry-run

# Full run (fetch, process, and post to Discord)
python src/main.py
```

### 7. Set Up Scheduling (GitHub Actions)

Create `.github/workflows/scheduled_post.yml`:

```yaml
name: Post Opportunities

on:
  schedule:
    # Runs every 3 days at 5 PM UTC (9 AM PST)
    - cron: '0 17 */3 * *'
  workflow_dispatch:  # Allow manual trigger

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt

      - name: Run bot
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          USAJOBS_API_KEY: ${{ secrets.USAJOBS_API_KEY }}
          USAJOBS_USER_AGENT: ${{ secrets.USAJOBS_USER_AGENT }}
          NOMINATIM_USER_AGENT: ${{ secrets.NOMINATIM_USER_AGENT }}
        run: |
          python src/main.py

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: bot-logs
          path: logs/
```

Add secrets to your GitHub repository:
- Settings → Secrets and variables → Actions → New repository secret
- Add: `OPENAI_API_KEY`, `DISCORD_WEBHOOK_URL`, `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT`, `NOMINATIM_USER_AGENT`

## 🧪 Testing

```bash
# Run all tests
pytest tests/

# Run specific test file
pytest tests/test_fetchers.py

# Run with coverage
pytest --cov=src tests/
```

## 📝 Usage

### Manual Execution

```bash
# Standard run (fetch new opportunities and post to Discord)
python src/main.py

# Dry run (preview what would be posted without actually posting)
python src/main.py --dry-run

# Verbose logging
python src/main.py --verbose

# Force reprocess all opportunities
python src/main.py --force-refresh
```

### Scheduled Execution

Once GitHub Actions is configured, the bot will automatically run every 3 days. You can also manually trigger the workflow:

1. Go to your GitHub repository
2. Navigate to Actions tab
3. Select "Post Opportunities" workflow
4. Click "Run workflow"

## 🔍 How It Works

### 1. Data Fetching (Every 3 Days)

The bot queries multiple sources:

- **Greenhouse**: Queries configured companies with `commitment=Intern` filter
- **Lever**: Queries by location and commitment filters
- **Ashby**: Public job postings endpoint
- **USAJOBS**: Location-based search with `LocationName=Los Angeles, CA` and `Radius=40`
- **MLH**: Season events API for curated hackathons

### 2. Data Processing

Each fetched item goes through:

1. **Normalization**: Convert to common schema
2. **Geocoding**: Convert city names to coordinates (with caching to respect OSM rate limits)
3. **Distance Calculation**: Haversine formula to calculate distance from SMC
4. **Filtering**: Apply distance and type rules
5. **LLM Classification**: OpenAI Structured Outputs extracts:
   - 2-3 bullet summary
   - CC-friendly assessment (boolean + reason)
   - Key eligibility requirements
6. **Deduplication**: Hash by `(company, normalized_title, city)`
7. **Scoring**: Rank by locality + recency + CC-friendliness + brand weight

### 3. Storage

Opportunities are stored in SQLite with:
- First seen / last seen timestamps
- Processing metadata (geocoded location, distance, LLM outputs)
- Posting history (never post same item twice)

### 4. Discord Posting

Top 5-8 new opportunities are formatted as Discord embeds:

```
┌─────────────────────────────────────────────┐
│ 🎯 New CS Opportunities (Oct 12, 2025)     │
├─────────────────────────────────────────────┤
│                                             │
│ 💼 Software Engineering Intern              │
│ 🏢 Riot Games                               │
│ 📍 West LA (≈ 13.2 miles from SMC)         │
│ 🏠 On-site                                  │
│ 📅 Deadline: Nov 3, 2025                   │
│                                             │
│ Why SMC students should care:              │
│ • Work with production infra for live games│
│ • Accepts undergrads from SoCal schools    │
│ • Strong experience for systems/infra track│
│                                             │
│ 🔗 Apply: [Link]                           │
│ 📌 Source: Greenhouse                      │
└─────────────────────────────────────────────┘
```

## 🛡️ Safety & Ethics

### API Usage Compliance

- ✅ **Uses official APIs only** (Greenhouse, Lever, Ashby, USAJOBS, MLH)
- ✅ **Respects rate limits** (1 req/sec for Nominatim geocoding)
- ✅ **No web scraping** of sites that prohibit it
- ✅ **Descriptive User-Agent** for all requests

### LLM Safety

- ✅ **Structured Outputs** (JSON schema enforcement) prevents hallucinations
- ✅ **Never invents URLs** - only uses verified source URLs
- ✅ **Conservative classification** - prefers false negatives over false positives
- ✅ **Transparent summaries** - clearly states "Likely CC-friendly" vs. confirmed

### Discord Best Practices

- ✅ **Webhook-based** (no persistent bot connection)
- ✅ **Rate limit aware** (respects Discord's limits)
- ✅ **No @everyone pings** (users can opt-in to roles)
- ✅ **Structured embeds** (clean, readable format)

## 🐛 Troubleshooting

### Common Issues

**Issue**: `No opportunities found`
- **Solution**: Check API keys are valid; verify companies in `watchlist.yaml` exist

**Issue**: `Geocoding rate limit exceeded`
- **Solution**: Increase `RATE_LIMIT_DELAY_SECONDS` in `.env`; geocode cache should prevent repeated lookups

**Issue**: `Discord webhook returns 404`
- **Solution**: Verify webhook URL is correct; ensure webhook hasn't been deleted in Discord

**Issue**: `OpenAI API error`
- **Solution**: Check API key; ensure you have sufficient credits; verify model access

**Issue**: `USAJOBS returns no results`
- **Solution**: Verify API key and User-Agent header; check keyword search terms

### Logs

Check logs for detailed debugging:

```bash
tail -f logs/bot.log
```

## 📚 API References

- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [USAJOBS API](https://developer.usajobs.gov/api-reference/)
- [MLH Season Events](https://mlh.io/seasons/2025/events)
- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Nominatim Geocoding](https://operations.osmfoundation.org/policies/nominatim/)

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- Blueprint inspiration from comprehensive ChatGPT research
- SMC CS Club for the use case and requirements
- OpenAI for Structured Outputs capability
- All the API providers (Greenhouse, Lever, Ashby, USAJOBS, MLH)

---

**Built with ❤️ for Santa Monica College CS students**
