/**
 * Location utilities - SINGLE SOURCE OF TRUTH for location detection
 * All Remote-US patterns defined here to avoid inconsistency
 */

/**
 * Check if location string indicates Remote-US or Hybrid-US
 * SINGLE SOURCE OF TRUTH: All Remote-US pattern detection happens here
 *
 * @param {string} locationText - Location string to check
 * @param {string} workplaceType - Workplace type (optional, for context)
 * @returns {boolean} True if location is Remote-US or Hybrid-US
 */
export function isRemoteUS(locationText, workplaceType = null) {
  if (!locationText || typeof locationText !== 'string') {
    return false;
  }

  const location = locationText.toLowerCase().trim();

  // First check: Is it explicitly marked as remote/hybrid?
  const isRemoteOrHybrid =
    workplaceType === 'remote' ||
    workplaceType === 'hybrid' ||
    /\b(remote|hybrid)\b/i.test(locationText);

  if (!isRemoteOrHybrid) {
    return false; // Not remote/hybrid, can't be Remote-US
  }

  // Check if it's Canada or another non-US country first (to exclude)
  const nonUSCountries = [
    'canada',
    'canadian',
    'toronto',
    'vancouver',
    'montreal',
    'ottawa',
    'uk',
    'united kingdom',
    'europe',
    'european',
    'india',
    'china',
    'japan',
    'australia',
    'mexico',
    'brazil',
    'singapore',
  ];

  for (const country of nonUSCountries) {
    if (location.includes(country)) {
      return false; // Remote in another country
    }
  }

  // Comprehensive Remote-US patterns (ALL variations)
  const remoteUSPatterns = [
    // Explicit US indicators
    'united states',
    'usa',
    'u.s.',
    'us-based',

    // Common Remote-US formats
    'remote in usa',
    'remote in us',
    'remote in united states',
    'remote - us',
    'remote, us',
    'remote (us)',
    'remote-us',

    // Hybrid variants
    'hybrid in usa',
    'hybrid in us',
    'hybrid - us',
    'hybrid, us',
    'hybrid (us)',
    'hybrid-us',
  ];

  // Check if location matches any pattern
  for (const pattern of remoteUSPatterns) {
    if (location.includes(pattern)) {
      return true;
    }
  }

  // Additional regex for edge cases like "Remote (United States)"
  if (/\b(remote|hybrid)[\s\-,(]*(in\s*)?(usa?|united\s+states|u\.s\.)/i.test(location)) {
    return true;
  }

  // If location is just "Remote" or "Hybrid" with no country indicator, assume US
  // This handles listings from US-focused repos where "Remote" implies "Remote US"
  if (location === 'remote' || location === 'hybrid') {
    return true;
  }

  return false;
}

/**
 * Check if location is Canada (to exclude)
 * @param {string} locationText - Location string to check
 * @returns {boolean} True if location is in Canada
 */
export function isCanada(locationText) {
  if (!locationText || typeof locationText !== 'string') {
    return false;
  }

  const location = locationText.toLowerCase();

  const canadaPatterns = [
    'canada',
    'toronto',
    'vancouver',
    'montreal',
    'ottawa',
    'calgary',
    'edmonton',
  ];

  return canadaPatterns.some(pattern => location.includes(pattern));
}
