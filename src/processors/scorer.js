/**
 * Scoring algorithm for ranking opportunities
 * 4-factor scoring: Location (35%), Recency (30%), Brand (20%), Keywords (15%)
 */

import { CONFIG } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { isRemoteUS } from '../utils/location.js';

// Weight distribution
const WEIGHTS = {
  location: 35,
  recency: 30,
  brand: 20,
  keywords: 15,
};

/**
 * Score an opportunity
 * @param {object} opportunity - Opportunity object with lat, lon, posted_at, company, skills
 * @returns {number} Score (0-100)
 */
export function scoreOpportunity(opportunity) {
  const locationScore = calculateLocationScore(opportunity);
  const recencyScore = calculateRecencyScore(opportunity);
  const brandScore = calculateBrandScore(opportunity);
  const keywordsScore = calculateKeywordsScore(opportunity);

  const totalScore =
    locationScore * (WEIGHTS.location / 100) +
    recencyScore * (WEIGHTS.recency / 100) +
    brandScore * (WEIGHTS.brand / 100) +
    keywordsScore * (WEIGHTS.keywords / 100);

  logger.debug(`Scored opportunity: ${opportunity.title}`, {
    total: Math.round(totalScore),
    location: Math.round(locationScore),
    recency: Math.round(recencyScore),
    brand: Math.round(brandScore),
    keywords: Math.round(keywordsScore),
  });

  return Math.round(totalScore);
}

/**
 * Calculate location score (0-35 points)
 * - California or remote-US: 35 points
 * - Distance-based scoring within California
 * @param {object} opportunity
 * @returns {number} Score (0-35)
 */
function calculateLocationScore(opportunity) {
  const maxPoints = WEIGHTS.location;

  // Remote-US or California location: full points
  const remoteUS = isRemoteUS(opportunity.location_text, opportunity.workplace_type);

  if (remoteUS || opportunity.is_california) {
    // Give bonus for closer distance within California
    if (opportunity.distance_km && opportunity.distance_km <= 100) {
      return maxPoints; // Within 100km of SMC
    } else if (opportunity.distance_km && opportunity.distance_km <= 500) {
      return maxPoints * 0.9; // Within 500km (still in CA)
    } else {
      return maxPoints * 0.8; // Far CA or remote-US
    }
  }

  return 0;
}

/**
 * Calculate recency score (0-30 points)
 * - < 7 days: 30 points
 * - < 14 days: 25 points
 * - < 30 days: 20 points
 * - < 60 days: 15 points
 * - < 90 days: 10 points
 * - Older: 5 points
 * @param {object} opportunity
 * @returns {number} Score (0-30)
 */
function calculateRecencyScore(opportunity) {
  const maxPoints = WEIGHTS.recency;

  if (!opportunity.posted_at) {
    return maxPoints * 0.5; // Unknown date: middle score
  }

  const postedDate = new Date(opportunity.posted_at);
  const now = new Date();
  const ageInDays = (now - postedDate) / (1000 * 60 * 60 * 24);

  if (ageInDays < 7) return maxPoints;
  if (ageInDays < 14) return maxPoints * 0.83; // 25 points
  if (ageInDays < 30) return maxPoints * 0.67; // 20 points
  if (ageInDays < 60) return maxPoints * 0.5;  // 15 points
  if (ageInDays < 90) return maxPoints * 0.33; // 10 points

  return maxPoints * 0.17; // 5 points
}

/**
 * Calculate brand score (0-20 points)
 * - Tier 1 (Google, Meta, etc.): 20 points
 * - Tier 2 (GoodRx, Spotify, etc.): 15 points
 * - Tier 3 (Startups, local gov): 10 points
 * - Unknown: 5 points
 * @param {object} opportunity
 * @returns {number} Score (0-20)
 */
function calculateBrandScore(opportunity) {
  const maxPoints = WEIGHTS.brand;
  const companyLower = (opportunity.company || '').toLowerCase();

  const brandCompanies = CONFIG.brandCompanies || {};

  // Check tier 1
  const tier1 = (brandCompanies.tier_1 || []).map(c => c.toLowerCase());
  if (tier1.some(brand => companyLower.includes(brand.toLowerCase()))) {
    return maxPoints; // 20 points
  }

  // Check tier 2
  const tier2 = (brandCompanies.tier_2 || []).map(c => c.toLowerCase());
  if (tier2.some(brand => companyLower.includes(brand.toLowerCase()))) {
    return maxPoints * 0.75; // 15 points
  }

  // Check tier 3
  const tier3 = (brandCompanies.tier_3 || []).map(c => c.toLowerCase());
  if (tier3.some(brand => companyLower.includes(brand.toLowerCase()))) {
    return maxPoints * 0.5; // 10 points
  }

  // Unknown brand: baseline score
  return maxPoints * 0.25; // 5 points
}

/**
 * Calculate keywords score (0-15 points)
 * - +1 point per relevant skill (max 15)
 * - Bonus for high-demand skills
 * @param {object} opportunity
 * @returns {number} Score (0-15)
 */
function calculateKeywordsScore(opportunity) {
  const maxPoints = WEIGHTS.keywords;
  const skills = Array.isArray(opportunity.skills) ? opportunity.skills : [];

  if (skills.length === 0) {
    return 0;
  }

  // High-value skills (2 points each)
  const highValueSkills = [
    'Machine Learning', 'AI', 'Kubernetes', 'AWS', 'GCP', 'Azure',
    'React', 'TypeScript', 'Python'
  ];

  // Standard skills (1 point each)
  let score = 0;

  for (const skill of skills) {
    if (highValueSkills.includes(skill)) {
      score += 2;
    } else {
      score += 1;
    }
  }

  return Math.min(score, maxPoints);
}

/**
 * Batch score multiple opportunities
 * @param {Array} opportunities - Array of opportunity objects
 * @returns {Array} Opportunities with scores assigned
 */
export function scoreOpportunities(opportunities) {
  return opportunities.map(opp => {
    opp.score = scoreOpportunity(opp);
    return opp;
  });
}
