/**
 * Nominatim Geocoding Service with caching
 * Geocodes location strings to lat/lon coordinates
 * Respects Nominatim usage policy (1 req/sec, custom User-Agent)
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/index.js';
import { calculateDistance } from '../utils/haversine.js';
import { isInCaliforniaBounds } from '../processors/filter.js';
import { isRemoteUS } from '../utils/location.js';
import { sleep } from '../utils/sleep.js';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const GEOCODING_DELAY = CONFIG.rateLimits?.geocodingDelay || 1200; // 1.2 seconds
const REQUEST_TIMEOUT = 10000; // 10 second timeout
const MAX_RETRIES = 3;

// Track last request time for rate limiting
let lastRequestTime = 0;

/**
 * Parse multi-location string and extract best location for geocoding
 * Handles formats like "New York, NY | San Francisco, CA"
 * @param {string} locationText - Location string (may contain | separator)
 * @returns {string} Parsed location string for geocoding
 */
function parseMultiLocationString(locationText) {
  if (!locationText || typeof locationText !== 'string') {
    return locationText;
  }

  // If contains pipe separator, split and find best location
  if (!locationText.includes('|')) {
    return locationText;
  }

  const locations = locationText.split('|')
    .map(l => l.trim())
    .filter(l => l.length > 0); // CRITICAL: Filter out empty strings

  if (locations.length === 0) {
    logger.warn(`Multi-location parsing resulted in empty array: "${locationText}"`);
    return locationText; // Return original if parsing fails
  }

  if (locations.length > 5) {
    logger.debug(`Unusually many locations (${locations.length}): "${locationText}"`);
  }

  // Priority 1: Find CA location (since we filter for CA opportunities)
  // Comprehensive list of CA cities to avoid missing opportunities
  const caLocation = locations.find(loc => {
    const lower = loc.toLowerCase();
    return /\b(?:california|calif\.)\b|,\s*ca\b|los angeles|san francisco|san diego|san jose|palo alto|mountain view|sunnyvale|cupertino|santa monica|irvine|oakland|sacramento|berkeley|pasadena|santa clara|menlo park|redwood city|san mateo|fremont|riverside|long beach|anaheim|bakersfield|fresno/i.test(lower);
  });

  if (caLocation) {
    logger.debug(`Multi-location parsed: extracted CA location "${caLocation}" from "${locationText}"`);
    return caLocation;
  }

  // Priority 2: Find US location (excluding Canada)
  const usLocation = locations.find(loc => {
    const lower = loc.toLowerCase();
    return !/canada|toronto|vancouver|montreal|ottawa/i.test(lower);
  });

  if (usLocation) {
    logger.debug(`Multi-location parsed: extracted US location "${usLocation}" from "${locationText}"`);
    return usLocation;
  }

  // Fallback: Use first location
  logger.debug(`Multi-location parsed: using first location "${locations[0]}" from "${locationText}"`);
  return locations[0];
}

/**
 * Geocode a location with caching
 * @param {string} locationText - Location string to geocode
 * @param {object} db - Database client
 * @returns {Promise<object|null>} Geocode result or null if not found
 */
export async function geocodeWithCache(locationText, db) {
  if (!locationText || typeof locationText !== 'string') {
    return null;
  }

  // Parse multi-location strings (e.g., "New York, NY | San Francisco, CA")
  const parsedLocation = parseMultiLocationString(locationText);

  // Normalize PARSED location for caching
  // This ensures "NY | SF, CA" and "SF, CA" use same cache entry
  const normalized = parsedLocation.trim().toLowerCase();

  // CRITICAL: Handle Remote-US locations BEFORE geocoding
  // These aren't physical locations - they're work arrangements
  // Use centralized Remote-US detection (single source of truth)
  if (isRemoteUS(parsedLocation)) {
    logger.debug(`Detected Remote-US location: "${locationText}" - marking as California-eligible`);

    // Use Santa Monica College coordinates as default for Remote-US
    const smcLat = CONFIG.smc.latitude;
    const smcLon = CONFIG.smc.longitude;

    return {
      lat: smcLat,
      lon: smcLon,
      is_california: true, // Remote-US is eligible for CA students
      distance_km: 0, // Remote = no commute
      display_name: 'Remote (United States)',
    };
  }

  // Check cache first
  try {
    const cached = await db.execute({
      sql: 'SELECT lat, lon, is_california FROM geocode_cache WHERE location_text = ?',
      args: [normalized],
    });

    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      logger.debug(`Geocode cache HIT: ${locationText}`);

      // Handle cached "not found" (lat = 0, lon = 0)
      if (row.lat === 0 && row.lon === 0) {
        return null;
      }

      const smcLat = CONFIG.smc.latitude;
      const smcLon = CONFIG.smc.longitude;
      const distanceKm = calculateDistance(smcLat, smcLon, row.lat, row.lon);

      return {
        lat: row.lat,
        lon: row.lon,
        is_california: row.is_california === 1,
        distance_km: distanceKm,
        display_name: null, // Not stored in cache
      };
    }
  } catch (error) {
    logger.warn(`Cache lookup failed for ${locationText}`, { error: error.message });
    // Continue to API call if cache fails
  }

  logger.debug(`Geocode cache MISS: ${locationText}`);

  // Geocode from API using PARSED location (not original multi-location string)
  const result = await geocodeLocation(parsedLocation);

  // Cache result (including negative results)
  try {
    if (!result) {
      // Cache "not found" as lat=0, lon=0
      await db.execute({
        sql: 'INSERT OR REPLACE INTO geocode_cache (location_text, lat, lon, is_california) VALUES (?, 0, 0, 0)',
        args: [normalized],
      });
      return null;
    }

    const isCa = isInCaliforniaBounds(result.lat, result.lon);
    const smcLat = CONFIG.smc.latitude;
    const smcLon = CONFIG.smc.longitude;
    const distanceKm = calculateDistance(smcLat, smcLon, result.lat, result.lon);

    await db.execute({
      sql: 'INSERT OR REPLACE INTO geocode_cache (location_text, lat, lon, is_california) VALUES (?, ?, ?, ?)',
      args: [normalized, result.lat, result.lon, isCa ? 1 : 0],
    });

    return {
      lat: result.lat,
      lon: result.lon,
      is_california: isCa,
      distance_km: distanceKm,
      display_name: result.display_name,
    };
  } catch (error) {
    logger.error(`Failed to cache geocode result for ${locationText}`, {
      error: error.message,
    });
    // Return result even if caching fails
    return result;
  }
}

/**
 * Geocode location via Nominatim API with rate limiting and retries
 * @param {string} locationText - Location to geocode
 * @returns {Promise<object|null>} Geocode result or null
 */
async function geocodeLocation(locationText) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Rate limiting: ensure minimum delay since last request
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < GEOCODING_DELAY) {
        const waitTime = GEOCODING_DELAY - timeSinceLastRequest;
        await sleep(waitTime);
      }

      lastRequestTime = Date.now();

      // Build URL with recommended parameters
      const url = new URL(NOMINATIM_BASE);
      url.searchParams.set('q', locationText);
      url.searchParams.set('format', 'jsonv2'); // Use jsonv2 to avoid 'class' reserved keyword
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1'); // Get state/country for California check
      url.searchParams.set('countrycodes', 'us'); // Restrict to USA

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(url.toString(), {
          headers: {
            'User-Agent': `${CONFIG.nominatim.userAgent} (${CONFIG.userEmail || 'contact@example.com'})`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle error status codes
        if (response.status === 403) {
          logger.error('Nominatim 403: Invalid User-Agent or policy violation');
          throw new Error('Nominatim 403: Check User-Agent configuration');
        }

        if (response.status === 429) {
          logger.warn('Nominatim 429: Rate limit exceeded');
          throw new Error('Nominatim rate limit exceeded');
        }

        if (response.status >= 500) {
          logger.warn(`Nominatim ${response.status}: Server error`);
          throw new Error(`Nominatim server error: ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`Nominatim HTTP ${response.status}`);
        }

        const results = await response.json();

        // Handle empty results (location not found)
        if (!Array.isArray(results) || results.length === 0) {
          logger.info(`No geocoding results for: ${locationText}`);
          return null;
        }

        const result = results[0];

        return {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon),
          display_name: result.display_name,
          state: result.address?.state,
          country: result.address?.country,
          country_code: result.address?.country_code,
        };

      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError.name === 'AbortError') {
          logger.warn(`Geocoding timeout for ${locationText} after ${REQUEST_TIMEOUT}ms`);
          throw new Error('Geocoding request timeout');
        }

        throw fetchError;
      }

    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      logger.warn(`Geocoding attempt ${attempt}/${MAX_RETRIES} failed for ${locationText}`, {
        error: error.message,
      });

      if (isLastAttempt) {
        logger.error(`All geocoding attempts failed for: ${locationText}`);
        return null;
      }

      // Exponential backoff for retries
      const backoffDelay = GEOCODING_DELAY * Math.pow(2, attempt);
      logger.debug(`Retrying in ${backoffDelay}ms...`);
      await sleep(backoffDelay);
    }
  }

  return null;
}

/**
 * Batch geocode multiple locations with rate limiting
 * @param {string[]} locations - Array of location strings
 * @param {object} db - Database client
 * @returns {Promise<Array>} Array of {location, result} objects
 */
export async function batchGeocode(locations, db) {
  logger.info(`Batch geocoding ${locations.length} locations`);

  const results = [];
  let notFound = 0;

  for (const location of locations) {
    const result = await geocodeWithCache(location, db);

    if (result) {
      if (result.is_california) {
        results.push({ location, result });
      }
    } else {
      notFound++;
    }
  }

  logger.info(`Batch geocoding complete`, {
    total: locations.length,
    found: results.length,
    notFound,
  });

  return results;
}

