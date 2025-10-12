# Testing Guide - SMC CS Opportunities Bot

## Pre-Test Checklist

### 1. Environment Variables
Verify your `.env` file has all required variables:

```bash
# Required
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id
TURSO_DATABASE_URL=your_url
TURSO_AUTH_TOKEN=your_token
DIGEST_CHANNEL_ID=1427031897309188106

# Recommended
USER_EMAIL=seanesla1156@gmail.com
USAJOBS_API_KEY=your_key (optional)
USAJOBS_USER_AGENT=seanesla1156@gmail.com
```

### 2. Dependencies
```bash
npm install
```

### 3. Database Setup
```bash
npm run db:migrate
```

### 4. Register Commands
```bash
npm run register-commands
```

---

## Testing Workflow

### Phase 1: Startup Test (5 minutes)

**Goal**: Verify bot starts without crashing

```bash
npm start
```

**Expected Output**:
```
✓ Configuration validated
✓ Database connected
✓ Running migrations...
✓ Discord bot logged in as: Opportunities Bot#7726
✓ Digest task scheduled
```

**If it crashes**: Check error message, likely missing env var or network issue.

---

### Phase 2: Basic Commands (5 minutes)

Test basic slash commands in Discord:

#### `/ping`
**Expected**: Response with latency
```
Pong! 🏓
Latency: 42ms
```

#### `/stats`
**Expected**: Database statistics
```
📊 Database Statistics

Total Opportunities: 0
Posted: 0
Unposted: 0
California: 0
Last Fetch: Never
```

#### `/debug` (admin only)
**Expected**: Full system status with all configuration checks
- Should show ✅ for Discord, Database
- Should show ⚠️ for any missing optional configs
- Should list watchlist companies

---

### Phase 3: Digest Job Test (30-60 minutes)

This is the **critical end-to-end test** of the entire pipeline.

#### Step 1: Trigger Digest Job
```
/test-digest
```

**Expected Timeline**:
1. "Thinking..." (Discord deferred reply)
2. Fetching from Greenhouse companies (~10-30 seconds)
3. Fetching from Lever companies (~5-10 seconds)
4. Geocoding locations (~1-2 min, depends on cache)
5. Processing and scoring (~5 seconds)
6. Posting to Discord (~2 seconds)

**Expected Response**:
```
✅ Digest Job Completed Successfully

Statistics:
• Fetched: 15 opportunities
• Filtered: 8 (CS + location)
• Geocoded: 7 locations
• Scored: 7 opportunities
• Saved: 7 to database
• Posted: 5 to Discord
• Errors: 0

⏱️ Duration: 87.3s
```

#### Step 2: Verify Discord Post
Check channel `1427031897309188106` for a new message with:
- Title: "🎓 New CS Opportunities for SMC Students"
- Multiple embeds (up to 10)
- Each embed should have:
  - Job title (clickable URL)
  - Company name
  - Location with distance from SMC
  - Type (Internship - Remote/Hybrid/On-site)
  - Skills list
  - CC-friendly indicator
  - Score in footer

#### Step 3: Verify Database
Run `/stats` again:
```
📊 Database Statistics

Total Opportunities: 7    ← Should be > 0
Posted: 5                  ← Should match "posted" from test-digest
Unposted: 2               ← Remaining opportunities
California: 7              ← All should be CA or remote-US
Last Fetch: 2025-01-12... ← Recent timestamp
```

---

## Verification Checklist

### ✅ Fetching Works
- [ ] Greenhouse API returns jobs (check logs for "Found X total jobs at...")
- [ ] Lever API returns jobs
- [ ] CS keyword filtering removes non-CS jobs
- [ ] Internship detection works (no full-time jobs)

### ✅ Geocoding Works
- [ ] Locations are geocoded successfully
- [ ] Cache is used on subsequent runs (faster second run)
- [ ] California bounds checking works
- [ ] Distance from SMC is calculated

### ✅ Scoring Works
- [ ] Opportunities have scores (0-100)
- [ ] Higher scored opportunities appear first
- [ ] Score factors make sense:
  - California/remote-US: higher scores
  - Recent postings: higher scores
  - Known brands: higher scores

### ✅ Discord Integration Works
- [ ] Message posts to correct channel
- [ ] Embeds display properly
- [ ] URLs are clickable
- [ ] Distance shows in miles
- [ ] Colors vary by score (green/blue/yellow/gray)

### ✅ Database Works
- [ ] Opportunities are saved
- [ ] Posted opportunities are tracked
- [ ] No duplicates on second run (deduplication works)
- [ ] Stats command shows accurate counts

---

## Common Issues & Solutions

### Issue: "No opportunities fetched from any source"
**Cause**: All companies may have zero CS internships posted
**Solution**:
- Check logs to see if API calls succeeded
- Try adding more companies to `config/watchlist.yaml`
- Some companies may have seasonal hiring (check in recruiting season)

### Issue: "All opportunities filtered out"
**Cause**: CS keyword filtering too strict OR all jobs are out of state
**Solution**:
- Check logs for filter reasons
- Verify companies actually have CS roles
- Check `src/processors/filter.js` - may need to add more keywords

### Issue: Geocoding very slow
**Cause**: Nominatim rate limit (1.2 seconds per location)
**Solution**:
- This is expected for first run
- Second run should be much faster (cache hits)
- 10 locations = ~12 seconds minimum

### Issue: "No geocoding results for: Remote - United States"
**Cause**: Remote locations can't be geocoded to coordinates
**Solution**:
- This is expected and handled
- Remote-US opportunities should still pass through filter
- Check logs - should show "is_california: true" for remote-US

### Issue: Bot crashes with import error
**Cause**: Missing critical bug fixes
**Solution**:
- Ensure you're on the latest commit
- Run `git pull` if working from remote
- Check `src/config/index.js` has `loadConfig()` export

---

## Performance Benchmarks

**Expected timings** (first run, no cache):

| Step | Expected Time | Notes |
|------|---------------|-------|
| Fetch (5 companies) | 10-30s | 200ms delay between companies |
| Geocode (10 locations) | 12-20s | 1.2s per location + retries |
| Filter + Score | 1-5s | Fast processing |
| Database Save | 1-2s | Batch insert |
| Discord Post | 1-2s | API call |
| **Total** | **25-60s** | Typical first run |

**Second run** (with cache): ~15-20 seconds (geocoding cached)

---

## Success Criteria

The bot is **working correctly** if:

1. ✅ Bot starts without errors
2. ✅ `/test-digest` completes successfully
3. ✅ At least 1 opportunity is fetched (if companies have openings)
4. ✅ Discord message appears in the channel
5. ✅ Embeds display properly with all fields
6. ✅ Database stats show saved opportunities
7. ✅ No crashes or unhandled errors in logs

---

## Next Steps After Successful Test

1. **Monitor scheduled run**: Wait for next cron trigger (every 3 days at 9 AM PST)
2. **Check logs**: `LOG_LEVEL=debug npm start` for verbose output
3. **Add more companies**: Edit `config/watchlist.yaml`
4. **Deploy to Oracle Cloud**: Follow deployment guide
5. **Set up monitoring**: Check Discord channel regularly

---

## Troubleshooting Commands

```bash
# View all logs with debug info
LOG_LEVEL=debug npm start

# Check database directly (requires turso CLI)
turso db shell discord-bot-seanesla
> SELECT COUNT(*) FROM opportunities;
> SELECT title, company, score FROM opportunities ORDER BY score DESC LIMIT 5;

# Re-register commands if they're not showing
npm run register-commands

# Reset database (WARNING: deletes all data)
turso db shell discord-bot-seanesla
> DROP TABLE IF EXISTS opportunities;
> DROP TABLE IF EXISTS posts;
npm run db:migrate
```

---

## Getting Help

If tests fail:
1. Check the error message in console
2. Look for stack traces
3. Check Discord bot logs
4. Verify all environment variables are set
5. Ensure Turso database is accessible
6. Confirm Discord bot has proper permissions in the channel

**Most common fix**: Missing environment variable or incorrect token.
