/**
 * Fetch internships from crowdsourced GitHub repositories
 * Source: vanshb03/Summer2026-Internships
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/index.js';
import { isRemoteUS, isCanada } from '../utils/location.js';

// Pull configuration from central config
const REPO_SOURCES = CONFIG.github.repositories;
const FETCH_TIMEOUT_MS = CONFIG.github.fetchTimeoutMs;
const MAX_RETRIES = CONFIG.github.maxRetries;
const RETRY_DELAY_MS = CONFIG.github.retryDelayMs;
const REQUEST_DELAY_MS = CONFIG.rateLimits.githubRequestDelay;

/**
 * Validate GitHub listing object structure
 * @param {object} listing - GitHub listing object
 * @returns {boolean} True if valid, false otherwise
 */
function isValidListing(listing) {
  if (!listing || typeof listing !== 'object') return false;

  // Required fields
  if (!listing.id || typeof listing.id !== 'string') return false;
  if (!listing.company_name || typeof listing.company_name !== 'string') return false;
  if (!listing.title || typeof listing.title !== 'string') return false;
  if (!listing.url || typeof listing.url !== 'string') return false;
  if (typeof listing.active !== 'boolean') return false;

  // Optional but validated if present
  if (listing.locations !== undefined && !Array.isArray(listing.locations)) return false;
  if (listing.date_posted !== undefined && typeof listing.date_posted !== 'number') return false;
  if (listing.date_updated !== undefined && typeof listing.date_updated !== 'number') return false;

  return true;
}

/**
 * Fetch with retry logic and exponential backoff
 * @param {string} url - URL to fetch
 * @param {number} attempt - Current attempt number
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, attempt = 1) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': CONFIG.nominatim?.userAgent || 'SMC-CS-Opportunities-Bot/1.0 (seane@smc.edu)',
      },
    });

    clearTimeout(timeoutId);

    // Comprehensive HTTP status handling
    if (!response.ok) {
      const body = await response.text().catch(() => 'Unable to read response');
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url,
        attempt,
        body: body.slice(0, 500), // Include more error context
      };

      // Safe JSON stringify with error handling and length limit
      let errorDetailsStr = 'Unable to stringify error details';
      try {
        errorDetailsStr = JSON.stringify(errorDetails).slice(0, 1000); // Max 1000 chars
      } catch (stringifyError) {
        errorDetailsStr = `status: ${errorDetails.status}, url: ${url.slice(0, 100)}`;
      }

      // Categorize errors for better logging
      if (response.status >= 400 && response.status < 500) {
        // Client errors (4xx) - likely permanent
        throw new Error(`Client error ${response.status}: ${response.statusText} - ${errorDetailsStr}`);
      } else if (response.status >= 500) {
        // Server errors (5xx) - retry-able
        throw new Error(`Server error ${response.status}: ${response.statusText} - ${errorDetailsStr}`);
      } else {
        // Other errors
        throw new Error(`HTTP error ${response.status}: ${response.statusText} - ${errorDetailsStr}`);
      }
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Retry on timeout or 5xx errors
    const shouldRetry =
      (error.name === 'AbortError' ||
       error.message.includes('HTTP 5')) &&
      attempt < MAX_RETRIES;

    if (shouldRetry) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
      logger.warn(`Fetch attempt ${attempt} failed, retrying in ${delay}ms`, {
        url,
        error: error.message,
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, attempt + 1);
    }

    throw error;
  }
}

/**
 * Fetch internships from GitHub crowdsourced repos
 * @returns {Promise<{success: boolean, data: Array, error: any}>}
 */
export async function fetchFromGitHubRepos() {
  logger.info('Fetching from GitHub crowdsourced repositories');

  const allOpportunities = [];
  const errors = [];
  const validationStats = {
    total: 0,
    active: 0,
    invalid: 0,
    eligible: 0,
    parseFailed: 0,
  };

  for (let i = 0; i < REPO_SOURCES.length; i++) {
    const repo = REPO_SOURCES[i];

    try {
      logger.info(`Fetching from ${repo.name}`);

      const response = await fetchWithRetry(repo.url);
      const listings = await response.json();

      // Validate response is an array
      if (!Array.isArray(listings)) {
        throw new Error(`Invalid response format from ${repo.name}: expected array, got ${typeof listings}`);
      }

      validationStats.total += listings.length;
      logger.info(`Found ${listings.length} total listings in ${repo.name}`);

      // Validate and filter listings
      const validListings = [];
      for (const listing of listings) {
        // Validate structure
        if (!isValidListing(listing)) {
          validationStats.invalid++;
          logger.debug('Invalid listing structure', {
            repo: repo.name,
            id: listing?.id,
            reason: 'Missing required fields or wrong types',
          });
          continue;
        }

        // Filter for active only
        if (listing.active === true) {
          validationStats.active++;
          validListings.push(listing);
        }
      }

      logger.info(`Validated ${validListings.length} active internships (${validationStats.invalid} invalid)`);

      // Convert to our opportunity format
      for (const listing of validListings) {
        try {
          const opportunity = parseGitHubListing(listing, repo);

          // Only include if location eligible (California or Remote-US)
          if (isLocationEligible(opportunity)) {
            validationStats.eligible++;
            allOpportunities.push(opportunity);
          }
        } catch (parseError) {
          validationStats.parseFailed++;
          logger.warn(`Failed to parse listing from ${repo.name}`, {
            id: listing.id,
            company: listing.company_name,
            error: parseError.message,
            stack: parseError.stack?.split('\n')[0], // Include first line of stack trace
          });
        }
      }

      logger.info(`Found ${validationStats.eligible} CA/Remote opportunities from ${repo.name}`);

      // Rate limiting: delay between repos
      if (i < REPO_SOURCES.length - 1) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
      }

    } catch (error) {
      logger.error(`Error fetching from ${repo.name}`, {
        error: error.message,
        stack: error.stack
      });
      errors.push({ repo: repo.name, error: error.message });
    }
  }

  // Log final validation statistics
  logger.info('GitHub fetch completed', {
    repos: REPO_SOURCES.length,
    totalListings: validationStats.total,
    activeListings: validationStats.active,
    invalidListings: validationStats.invalid,
    parseFailed: validationStats.parseFailed,
    eligible: validationStats.eligible,
    errors: errors.length,
  });

  return {
    success: errors.length < REPO_SOURCES.length, // Success if at least one repo worked
    data: allOpportunities,
    errors: errors.length > 0 ? errors : null,
    validationStats, // Include stats for monitoring
  };
}

/**
 * Extract skills from job title
 * @param {string} title - Job title
 * @returns {Array<string>} Extracted skills
 */
function extractSkills(title) {
  const skills = [];
  const titleLower = title.toLowerCase();

  // Common tech keywords to extract
  const skillKeywords = [
    'software', 'backend', 'frontend', 'full-stack', 'fullstack',
    'mobile', 'ios', 'android', 'web', 'data', 'machine learning', 'ml',
    'ai', 'artificial intelligence', 'cloud', 'devops', 'security',
    'embedded', 'systems', 'infrastructure', 'platform', 'api',
    'python', 'java', 'javascript', 'c++', 'go', 'rust', 'react', 'node',
  ];

  for (const keyword of skillKeywords) {
    if (titleLower.includes(keyword)) {
      // Normalize to title case
      const normalized = keyword
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      skills.push(normalized);
    }
  }

  return skills;
}

/**
 * Convert GitHub listing to our opportunity format
 * @param {object} listing - GitHub listing object
 * @param {object} repo - Repo metadata
 * @returns {object} Opportunity object
 */
function parseGitHubListing(listing, repo) {
  // Safely combine all locations into single string
  let location_text = 'Not specified';
  if (Array.isArray(listing.locations) && listing.locations.length > 0) {
    // Filter out empty/null locations
    const validLocations = listing.locations.filter(loc => loc && typeof loc === 'string' && loc.trim());
    location_text = validLocations.length > 0 ? validLocations.join(' | ') : 'Not specified';
  } else if (typeof listing.locations === 'string' && listing.locations.trim()) {
    location_text = listing.locations.trim();
  }

  // Determine workplace type with hybrid support
  const locationLower = location_text.toLowerCase();
  let workplace_type = 'on-site'; // Default

  if (/hybrid/i.test(locationLower)) {
    workplace_type = 'hybrid';
  } else if (/remote/i.test(locationLower)) {
    workplace_type = 'remote';
  }

  // Parse sponsorship info with comprehensive mapping
  let sponsorship_info = null;
  if (listing.sponsorship) {
    const sponsorshipLower = listing.sponsorship.toLowerCase();
    if (sponsorshipLower.includes('offers sponsorship') || sponsorshipLower.includes('provides sponsorship')) {
      sponsorship_info = 'Offers sponsorship';
    } else if (sponsorshipLower.includes('citizenship') || sponsorshipLower.includes('citizen')) {
      sponsorship_info = 'US Citizenship required';
    } else if (sponsorshipLower.includes('does not offer') || sponsorshipLower.includes('no sponsorship')) {
      sponsorship_info = 'No sponsorship';
    } else {
      // Capture unknown sponsorship values for monitoring
      sponsorship_info = listing.sponsorship;
      logger.debug('Unknown sponsorship value', { value: listing.sponsorship, company: listing.company_name });
    }
  }

  return {
    // Core fields
    source: 'github-crowdsource',
    source_id: listing.id,
    company: listing.company_name,
    title: listing.title,
    url: listing.url,

    // Location
    location_text,
    workplace_type,
    lat: null, // Geocoding happens later in processor
    lon: null,
    distance_km: null,
    is_california: false, // Will be set by geocoder

    // Dates
    posted_at: listing.date_posted ? new Date(listing.date_posted * 1000).toISOString() : null,
    deadline: null, // GitHub repos don't typically have deadlines

    // Type
    type: 'internship', // All listings in this repo are internships

    // Description (minimal - we don't have full description)
    description_preview: `${listing.title} at ${listing.company_name}`,
    description_raw: `${listing.title} at ${listing.company_name}\n\nSeason: ${listing.season || repo.season}\nLocations: ${location_text}${sponsorship_info ? `\nSponsorship: ${sponsorship_info}` : ''}`,

    // Skills extracted from title
    skills: extractSkills(listing.title),

    // Other required fields
    compensation: null, // Not provided by GitHub repos
    cc_friendly: true, // Crowdsourced listings are pre-filtered by community
    cc_exclusion_reason: null,
    score: 0, // Will be calculated by scorer

    // Note: metadata like season, sponsorship, etc. is embedded in description_raw
    // No separate metadata column in database - all relevant info is in other fields
  };
}

/**
 * Check if location is California or Remote-US
 * @param {object} opportunity
 * @returns {boolean}
 */
function isLocationEligible(opportunity) {
  // Use centralized Remote-US detection (single source of truth)
  if (isRemoteUS(opportunity.location_text, opportunity.workplace_type)) {
    return true;
  }

  // Exclude Canada/international locations
  if (isCanada(opportunity.location_text)) {
    return false;
  }

  // Check for California locations (strict patterns to avoid false positives)
  const caPatterns = [
    /\b(?:california|calif\.)\b/i,
    /,\s*ca\b/i, // ", CA" format (common in US addresses)
    /\bca\s*,?\s*(?:usa|united states|us)\b/i, // "CA, USA" or "CA USA"
    // Cities
    /los angeles/i, /san francisco/i, /san diego/i, /san jose/i,
    /oakland/i, /sacramento/i, /irvine/i, /santa monica/i,
    /palo alto/i, /mountain view/i, /sunnyvale/i, /cupertino/i,
    /santa clara/i, /menlo park/i, /berkeley/i, /pasadena/i
  ];

  for (const pattern of caPatterns) {
    if (pattern.test(opportunity.location_text)) {
      return true;
    }
  }

  return false;
}
