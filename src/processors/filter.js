/**
 * Filtering logic for opportunities
 * - CS keyword matching
 * - California location checking
 * - CC-friendly detection
 */

import { CONFIG } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { isRemoteUS } from '../utils/location.js';

// CS-related keywords (must match at least one)
const CS_KEYWORDS = [
  /software\s+(engineer|developer|engineering|development)/i,
  /computer\s+science/i,
  /computer\s+engineering/i,
  /data\s+(scientist|engineer|analyst|science|engineering)/i,
  /machine\s+learning|ML|AI|artificial\s+intelligence/i,
  /frontend|front[\s-]end/i,
  /backend|back[\s-]end/i,
  /full[\s-]?stack/i,
  /devops|site\s+reliability\s+engineer|SRE/i,
  /(security|cyber[\s-]?security)\s+engineer/i,
  /mobile\s+developer|iOS|Android|mobile\s+engineering/i,
  /QA\s+engineer|test\s+engineer|quality\s+assurance/i,
  /technical\s+product\s+manager|TPM/i,
  /web\s+developer|web\s+development/i,
  /cloud\s+engineer/i,
  /database\s+administrator|DBA/i,
  /game\s+developer|game\s+programmer/i,
];

// Exclusion keywords (if present, likely not CS)
const EXCLUSION_KEYWORDS = [
  /mechanical\s+engineer/i,
  /civil\s+engineer/i,
  /chemical\s+engineer/i,
  /electrical\s+engineer(?!ing\s+&\s+computer)/i, // Exclude unless "Electrical Engineering & Computer"
  /\bHVAC\b/i,
  /\baccounting\b(?!.*software)/i,
  /\bfinance\b(?!.*tech|.*fintech|.*software)/i,
  /\bmarketing\b(?!.*tech|.*growth\s+engineer)/i,
  /\bsales\b(?!.*engineer|.*technical)/i,
  /\bhuman\s+resources\b|\bHR\b/i, // FIX: Added word boundaries to prevent matching "through", "three", "chrome", etc.
  /administrative\s+assistant/i,
  /receptionist/i,
];

/**
 * Check if opportunity is CS-related based on title and description
 * @param {string} title - Job title
 * @param {string} description - Job description
 * @returns {boolean}
 */
export function isCSRelated(title, description = '', debug = false) {
  const text = `${title} ${description}`.toLowerCase();

  // Check exclusions first (if found, reject immediately)
  for (const exclusion of EXCLUSION_KEYWORDS) {
    if (exclusion.test(text)) {
      if (debug) {
        logger.debug(`[CS Filter] EXCLUDED by pattern: ${exclusion} for title: "${title}"`);
      }
      return false;
    }
  }

  // Check if any CS keyword matches
  for (const keyword of CS_KEYWORDS) {
    if (keyword.test(text)) {
      if (debug) {
        logger.debug(`[CS Filter] MATCHED by pattern: ${keyword} for title: "${title}"`);
      }
      return true;
    }
  }

  if (debug) {
    logger.debug(`[CS Filter] NO MATCH for title: "${title}"`);
  }
  return false;
}

/**
 * Check if coordinates are within California bounds
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean}
 */
export function isInCaliforniaBounds(lat, lon) {
  const { north, south, east, west } = CONFIG.california;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

/**
 * Check if opportunity is eligible based on location
 * - California locations: Always eligible
 * - Remote-US: Always eligible
 * - Out of state: Not eligible
 * @param {object} opportunity - Opportunity object
 * @param {string} opportunity.location_text - Location string
 * @param {number} opportunity.lat - Latitude (optional)
 * @param {number} opportunity.lon - Longitude (optional)
 * @param {string} opportunity.workplace_type - Workplace type (optional)
 * @returns {boolean}
 */
export function isLocationEligible(opportunity) {
  const { location_text, lat, lon, workplace_type } = opportunity;

  // Use centralized Remote-US detection (single source of truth)
  if (isRemoteUS(location_text, workplace_type)) {
    return true;
  }

  // Check if in California (if coordinates available)
  if (lat && lon) {
    return isInCaliforniaBounds(lat, lon);
  }

  // If no coordinates yet, allow it through (geocoding will happen later)
  return true;
}

/**
 * Detect CC-unfriendly language in job description
 * @param {string} description - Job description
 * @returns {object} { isFriendly: boolean, reason: string }
 */
export function detectCCFriendly(description = '') {
  const text = description.toLowerCase();

  // Red flags that indicate bachelor's degree required
  const redFlags = [
    { regex: /bachelor'?s?\s+(degree\s+)?required/i, reason: "Bachelor's degree required" },
    { regex: /bs\/ba\s+required/i, reason: "BS/BA required" },
    { regex: /4-year\s+degree\s+required/i, reason: "4-year degree required" },
    { regex: /must\s+be\s+enrolled\s+in\s+bachelor'?s/i, reason: "Must be enrolled in Bachelor's program" },
    { regex: /junior\s+or\s+senior\s+standing/i, reason: "Junior or senior standing required" },
    { regex: /must\s+have\s+completed\s+at\s+least\s+3\s+years/i, reason: "3+ years of university required" },
  ];

  for (const flag of redFlags) {
    if (flag.regex.test(text)) {
      return { isFriendly: false, reason: flag.reason };
    }
  }

  return { isFriendly: true, reason: null };
}

/**
 * Comprehensive filter for opportunities
 * @param {object} opportunity - Opportunity object
 * @returns {object} { passed: boolean, reasons: string[] }
 */
export function filterOpportunity(opportunity) {
  const reasons = [];

  // Check CS relevance (skip for GitHub crowdsourced - already human-verified)
  if (opportunity.source !== 'github-crowdsource') {
    if (!isCSRelated(opportunity.title, opportunity.description_raw)) {
      reasons.push('Not CS-related');
    }
  }

  // Check location eligibility (skip for GitHub crowdsourced - already filtered by fetcher)
  if (opportunity.source !== 'github-crowdsource') {
    if (!isLocationEligible(opportunity)) {
      reasons.push('Location not eligible (not CA and not remote-US)');
    }
  }

  // Check CC-friendly (warning only, not rejection)
  const ccCheck = detectCCFriendly(opportunity.description_raw);
  if (!ccCheck.isFriendly) {
    opportunity.cc_friendly = 0;
    opportunity.cc_exclusion_reason = ccCheck.reason;
  } else {
    opportunity.cc_friendly = 1;
    opportunity.cc_exclusion_reason = null;
  }

  return {
    passed: reasons.length === 0,
    reasons
  };
}
