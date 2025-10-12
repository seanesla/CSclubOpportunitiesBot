/**
 * Shared job type detection utilities
 * Used by Greenhouse and Lever fetchers
 */

const REMOTE_PATTERNS = [
  'remote', 'work from home', 'wfh', 'distributed',
  'virtual', 'anywhere', 'location flexible',
];

/**
 * Detect workplace type from location and metadata text
 * @param {string} locationText - Combined location text (lowercase)
 * @returns {'remote'|'hybrid'|'on-site'}
 */
export function detectWorkplaceType(locationText) {
  const text = (locationText || '').toLowerCase();

  for (const pattern of REMOTE_PATTERNS) {
    if (text.includes(pattern)) {
      return 'remote';
    }
  }

  if (text.includes('hybrid')) {
    return 'hybrid';
  }

  return 'on-site';
}

/**
 * Check if opportunity is an internship based on its type field
 * @param {object} opportunity - Opportunity with a .type field
 * @returns {boolean}
 */
export function isInternship(opportunity) {
  return opportunity.type === 'internship';
}
