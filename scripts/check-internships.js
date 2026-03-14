#!/usr/bin/env node

/**
 * Fetch CS internships from SimplifyJobs, filter for CA/Remote-US,
 * and post new ones to a Discord webhook.
 *
 * Usage:
 *   node scripts/check-internships.js              # full run
 *   node scripts/check-internships.js --dry-run    # preview without posting
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTED_IDS_PATH = join(ROOT, 'data', 'posted_ids.json');

const LISTINGS_URL =
  'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Category filter
// ---------------------------------------------------------------------------
const CS_CATEGORIES = new Set([
  'software engineering',
  'software',
  'ai/ml/data',
  'data science, ai & machine learning',
  'quantitative finance',
  'quant',
]);

// ---------------------------------------------------------------------------
// Location helpers (ported from src/utils/location.js)
// ---------------------------------------------------------------------------
function isCanada(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const cities = ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'edmonton'];
  if (cities.some((c) => lower.includes(c))) return true;
  if (/\bremote\s+in\s+can\b/i.test(text)) return true;
  return false;
}

function isRemoteUS(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  const isRemoteOrHybrid = /\b(remote|hybrid)\b/i.test(text);
  if (!isRemoteOrHybrid) return false;

  if (/\bglobal\s+remote\b/i.test(text) || /\bremote\s+global\b/i.test(text)) return false;
  if (isCanada(text)) return false;

  const nonUS = ['uk', 'united kingdom', 'europe', 'european', 'india', 'china', 'japan', 'australia', 'mexico', 'brazil', 'singapore'];
  if (nonUS.some((c) => lower.includes(c))) return false;

  // Explicit US patterns
  if (/\b(united\s+states|usa|u\.s\.|us-based)\b/i.test(text)) return true;
  if (/\b(remote|hybrid)[\s\-,(]*(in\s*)?(usa?|united\s+states|u\.s\.)/i.test(lower)) return true;
  // "Remote in XX" (2-letter US state)
  if (/\bremote\s+in\s+[A-Z]{2}\b/i.test(text)) return true;
  // "Remote, XX"
  if (/\bremote\s*,\s*[A-Z]{2}\b/i.test(text)) return true;
  // Bare "Remote" or "Hybrid" → assume US for this US-focused repo
  if (lower === 'remote' || lower === 'hybrid') return true;

  return false;
}

const CA_PATTERNS = [
  /\b(?:california|calif\.)\b/i,
  /,\s*ca\b/i,
  /\bca\s*,?\s*(?:usa|united states|us)\b/i,
  /los angeles/i, /san francisco/i, /san diego/i, /san jose/i,
  /oakland/i, /sacramento/i, /irvine/i, /santa monica/i,
  /palo alto/i, /mountain view/i, /sunnyvale/i, /cupertino/i,
  /santa clara/i, /menlo park/i, /berkeley/i, /pasadena/i,
];

function isCalifornia(text) {
  if (!text) return false;
  return CA_PATTERNS.some((p) => p.test(text));
}

function isLocationEligible(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return false;
  const joined = locations.join(' | ');
  if (isCanada(joined)) return false;
  if (isRemoteUS(joined)) return true;
  return locations.some((loc) => isCalifornia(loc) || isRemoteUS(loc));
}

// ---------------------------------------------------------------------------
// Skill extraction (from title)
// ---------------------------------------------------------------------------
const SKILL_KEYWORDS = [
  'software', 'backend', 'frontend', 'full-stack', 'fullstack',
  'mobile', 'ios', 'android', 'web', 'data', 'machine learning', 'ml',
  'ai', 'cloud', 'devops', 'security', 'embedded', 'systems',
  'infrastructure', 'platform', 'python', 'java', 'javascript',
  'c++', 'go', 'rust', 'react', 'node',
];

function extractSkills(title) {
  const lower = title.toLowerCase();
  return SKILL_KEYWORDS
    .filter((kw) => lower.includes(kw))
    .map((kw) => kw.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
}

// ---------------------------------------------------------------------------
// Discord embed builder
// ---------------------------------------------------------------------------
function buildEmbed(listing) {
  const locationText = listing.locations?.join(' | ') || 'Not specified';

  const isRemote = /remote/i.test(locationText);
  const isHybrid = /hybrid/i.test(locationText);
  const typeLabel = isHybrid ? 'Internship (Hybrid)' : isRemote ? 'Internship (Remote)' : 'Internship';

  const skills = extractSkills(listing.title);
  const hasCCFriendly = Array.isArray(listing.degrees) && listing.degrees.some((d) => /associate/i.test(d));
  if (hasCCFriendly) skills.push('CC-Friendly');

  const season = listing.season
    || (Array.isArray(listing.terms) ? listing.terms.join(', ') : null)
    || 'Summer 2026';

  const fields = [
    { name: 'Company', value: listing.company_name, inline: true },
    { name: 'Location', value: locationText.length > 1024 ? locationText.slice(0, 1021) + '...' : locationText, inline: true },
    { name: 'Type', value: typeLabel, inline: true },
  ];

  if (skills.length > 0) {
    fields.push({ name: 'Skills', value: skills.join(', '), inline: false });
  }

  if (Array.isArray(listing.degrees) && listing.degrees.length > 0) {
    fields.push({ name: 'Degrees', value: listing.degrees.join(', '), inline: true });
  }

  return {
    title: listing.title.length > 256 ? listing.title.slice(0, 253) + '...' : listing.title,
    url: listing.url,
    color: 0x0099ff, // blue
    fields,
    footer: { text: `SimplifyJobs \u2022 ${season}` },
    timestamp: listing.date_posted ? new Date(listing.date_posted * 1000).toISOString() : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Discord webhook poster (batches of 10)
// ---------------------------------------------------------------------------
async function postToWebhook(embeds) {
  for (let i = 0; i < embeds.length; i += 10) {
    const batch = embeds.slice(i, i + 10);
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: batch }),
    });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get('retry-after') || '5') * 1000;
      console.log(`Rate limited, waiting ${retryAfter}ms...`);
      await new Promise((r) => setTimeout(r, retryAfter));
      // Retry this batch
      i -= 10;
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Webhook error ${res.status}: ${body.slice(0, 200)}`);
    }

    // Small delay between batches to be polite
    if (i + 10 < embeds.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Fetching listings from SimplifyJobs...`);
  const res = await fetch(LISTINGS_URL);
  if (!res.ok) throw new Error(`Failed to fetch listings: ${res.status} ${res.statusText}`);

  const listings = await res.json();
  console.log(`Fetched ${listings.length} total listings`);

  // Filter
  const filtered = listings.filter((l) => {
    if (!l.id || !l.active) return false;
    if (l.is_visible === false) return false;
    if (l.category && !CS_CATEGORIES.has(l.category.toLowerCase())) return false;
    if (!isLocationEligible(l.locations)) return false;
    return true;
  });
  console.log(`${filtered.length} listings match CS + CA/Remote-US filters`);

  // Load posted IDs
  let postedIds = new Set();
  if (existsSync(POSTED_IDS_PATH)) {
    const raw = JSON.parse(readFileSync(POSTED_IDS_PATH, 'utf8'));
    postedIds = new Set(raw);
  }
  console.log(`${postedIds.size} previously posted IDs loaded`);

  // Find new listings
  const newListings = filtered.filter((l) => !postedIds.has(l.id));
  console.log(`${newListings.length} new listings to post`);

  if (newListings.length === 0) {
    console.log('Nothing new to post.');
    // Still prune stale IDs
    pruneStaleIds(postedIds, listings);
    return;
  }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN (not posting) ---');
    for (const l of newListings.slice(0, 20)) {
      console.log(`  [${l.company_name}] ${l.title} — ${l.locations?.join(', ')}`);
    }
    if (newListings.length > 20) console.log(`  ... and ${newListings.length - 20} more`);
    return;
  }

  // Post to Discord
  if (!WEBHOOK_URL) {
    console.error('DISCORD_WEBHOOK_URL not set. Skipping posting.');
    return;
  }

  const embeds = newListings.map(buildEmbed);
  console.log(`Posting ${embeds.length} embeds to Discord...`);
  await postToWebhook(embeds);

  // Save new IDs
  for (const l of newListings) postedIds.add(l.id);
  pruneStaleIds(postedIds, listings);

  console.log('Done!');
}

/**
 * Remove IDs from posted set that no longer appear in the current listings.
 * Prevents unbounded growth of posted_ids.json.
 */
function pruneStaleIds(postedIds, currentListings) {
  const currentIds = new Set(currentListings.map((l) => l.id));
  let pruned = 0;
  for (const id of postedIds) {
    if (!currentIds.has(id)) {
      postedIds.delete(id);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`Pruned ${pruned} stale IDs`);

  writeFileSync(POSTED_IDS_PATH, JSON.stringify([...postedIds], null, 2) + '\n');
  console.log(`Saved ${postedIds.size} IDs to posted_ids.json`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
