/**
 * Lever Postings API Fetcher
 * Fetches opportunities from companies using Lever ATS
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { isCSRelated } from '../processors/filter.js';
import { CONFIG } from '../config/index.js';
import { sleep } from '../utils/sleep.js';
import { extractSkills } from '../utils/skills.js';
import { detectWorkplaceType, isInternship } from '../utils/job-type.js';
const BASE_URL = 'https://api.lever.co/v0/postings';
const RATE_LIMIT_DELAY = 200; // 200ms between requests
const REQUEST_TIMEOUT = 15000; // 15 second timeout

/**
 * Fetch jobs from a single Lever company
 * @param {string} company - Company identifier (e.g., 'netflix')
 * @returns {Promise<object>} Result object with success, data, error
 */
export async function fetchLeverCompany(company) {
  try {
    logger.info(`Fetching Lever jobs for: ${company}`);

    const url = `${BASE_URL}/${company}?mode=json`;

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': `SMC-CS-Opportunities-Bot/1.0 (${CONFIG.userEmail || 'contact@example.com'})`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error(`Lever API error for ${company}`, {
          status: response.status,
          statusText: response.statusText,
        });
        return { success: false, data: [], error: `HTTP ${response.status}` };
      }

      const jobs = await response.json();

      // Validate response structure (Lever returns array directly)
      if (!Array.isArray(jobs)) {
        logger.error(`Invalid JSON response from Lever for ${company}`);
        return { success: false, data: [], error: 'Expected array response' };
      }

      logger.info(`Found ${jobs.length} total jobs at ${company}`);

      // Parse and filter for CS-related internships
      const opportunities = [];
      for (const job of jobs) {
        const opportunity = parseLeverJob(job, company);

        // Filter for CS-related positions
        if (!isCSRelated(opportunity.title, opportunity.description_raw, true)) {
          logger.debug(`Filtered out (not CS): ${opportunity.title}`);
          continue;
        }

        // Filter for internships
        if (!isInternship(opportunity)) {
          logger.debug(`Filtered out (not internship): ${opportunity.title} (type: ${opportunity.type})`);
          continue;
        }

        logger.info(`✓ Passed all filters: ${opportunity.title}`);
        opportunities.push(opportunity);
      }

      logger.info(`Filtered to ${opportunities.length} CS internships at ${company}`);
      return { success: true, data: opportunities, error: null };

    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        logger.error(`Request timeout for ${company} after ${REQUEST_TIMEOUT}ms`);
        return { success: false, data: [], error: 'Request timeout' };
      }

      throw fetchError;
    }

  } catch (error) {
    const errorType = error.code || error.name || 'Unknown';
    logger.error(`Failed to fetch Lever jobs for ${company}`, {
      error: error.message,
      type: errorType,
      stack: error.stack,
    });
    return { success: false, data: [], error: error.message };
  }
}

/**
 * Fetch jobs from multiple Lever companies
 * @param {string[]} companies - Array of company identifiers
 * @returns {Promise<Array>} Combined array of opportunities
 */
export async function fetchLeverOpportunities(companies) {
  logger.info(`Fetching from ${companies.length} Lever companies`);

  const allOpportunities = [];
  const errors = [];

  for (const company of companies) {
    const result = await fetchLeverCompany(company);

    if (result.success) {
      allOpportunities.push(...result.data);
    } else {
      errors.push({ company, error: result.error });
    }

    // Rate limiting: wait between companies
    await sleep(RATE_LIMIT_DELAY);
  }

  if (errors.length > 0) {
    logger.warn(`Failed to fetch from ${errors.length} Lever companies`, { errors });
  }

  logger.info(`Total Lever opportunities found: ${allOpportunities.length}`);
  return allOpportunities;
}

/**
 * Parse Lever job into standardized opportunity format
 * @param {object} job - Raw Lever job object
 * @param {string} company - Company identifier
 * @returns {object} Standardized opportunity object
 */
function parseLeverJob(job, company) {
  // Detect job type
  const jobType = detectJobType(job);

  // Detect workplace type
  const workplaceType = detectLeverWorkplaceType(job);

  // Get location
  const locationText = job.categories?.location || job.text || 'Not specified';

  // Extract description
  const descriptionRaw = job.description || job.descriptionPlain || '';
  const descriptionPreview = (job.descriptionPlain || descriptionRaw).slice(0, 200).trim();

  // Get department/team
  const department = job.categories?.team || null;

  return {
    source: 'lever',
    source_id: job.id,
    internal_job_id: null,
    requisition_id: job.requisitionCode || null,
    title: job.text,
    company: job.name || company,
    department,
    type: jobType,
    workplace_type: workplaceType,
    location_text: locationText,
    lat: null, // Will be geocoded later
    lon: null,
    distance_km: null,
    is_california: null,
    url: job.hostedUrl || job.applyUrl,
    deadline: null, // Lever doesn't provide deadline
    posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
    description_raw: descriptionRaw,
    description_preview: descriptionPreview,
    skills: extractSkills(descriptionRaw),
    compensation: job.salaryRange || null,
    cc_friendly: 1,
    cc_exclusion_reason: null,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    hash: null,
    score: null,
  };
}

/**
 * Detect job type from title and categories
 * @param {object} job - Lever job object
 * @returns {string}
 */
function detectJobType(job) {
  // Check commitment category
  const commitment = job.categories?.commitment?.toLowerCase() || '';
  if (commitment.includes('intern') || commitment.includes('co-op')) {
    return 'internship';
  }

  // Check title
  const titleLower = job.text.toLowerCase();
  if (titleLower.includes('intern') || titleLower.includes('co-op')) {
    return 'internship';
  }
  if (titleLower.includes('contract')) {
    return 'contract';
  }
  if (titleLower.includes('part-time') || titleLower.includes('part time')) {
    return 'part-time';
  }

  return 'full-time';
}

/**
 * Detect workplace type from Lever job object
 * @param {object} job - Lever job object
 * @returns {string}
 */
function detectLeverWorkplaceType(job) {
  const locationText = (job.categories?.location || job.text || '').toLowerCase();
  const workplaceTypeMeta = (job.workplaceType || '').toLowerCase();
  return detectWorkplaceType(`${locationText} ${workplaceTypeMeta}`);
}
