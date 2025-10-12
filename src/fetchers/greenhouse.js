/**
 * Greenhouse Job Board API Fetcher
 * Fetches opportunities from companies using Greenhouse ATS
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { isCSRelated } from '../processors/filter.js';
import { CONFIG } from '../config/index.js';
import { sleep } from '../utils/sleep.js';
import { extractSkills } from '../utils/skills.js';
import { detectWorkplaceType, isInternship } from '../utils/job-type.js';
const BASE_URL = 'https://boards-api.greenhouse.io/v1/boards';
const RATE_LIMIT_DELAY = 200; // 200ms between requests (no strict limit per docs)
const REQUEST_TIMEOUT = 15000; // 15 second timeout

/**
 * Fetch jobs from a single Greenhouse company board
 * @param {string} company - Company board token (e.g., 'riotgames')
 * @returns {Promise<Array>} Array of opportunity objects
 */
export async function fetchGreenhouseCompany(company) {
  try {
    logger.info(`Fetching Greenhouse jobs for: ${company}`);

    const url = `${BASE_URL}/${company}/jobs?content=true`;

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
        logger.error(`Greenhouse API error for ${company}`, {
          status: response.status,
          statusText: response.statusText,
        });
        return { success: false, data: [], error: `HTTP ${response.status}` };
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== 'object') {
        logger.error(`Invalid JSON response from Greenhouse for ${company}`);
        return { success: false, data: [], error: 'Invalid JSON structure' };
      }

      const jobs = Array.isArray(data.jobs) ? data.jobs : [];

    logger.info(`Found ${jobs.length} total jobs at ${company}`);

    // Parse and filter for CS-related internships
    const opportunities = [];
    for (const job of jobs) {
      const opportunity = parseGreenhouseJob(job, company);

      // Filter for CS-related and internship positions
      const csCheck = isCSRelated(opportunity.title, opportunity.description_raw, true);
      const internCheck = isInternship(opportunity);

      if (!csCheck) {
        logger.debug(`Filtered out (not CS): ${opportunity.title}`);
        continue; // Skip non-CS jobs
      }

      if (!internCheck) {
        logger.debug(`Filtered out (not internship): ${opportunity.title} (type: ${opportunity.type})`);
        continue; // Skip non-internship positions
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
    logger.error(`Failed to fetch Greenhouse jobs for ${company}`, {
      error: error.message,
      type: errorType,
      stack: error.stack,
    });
    return { success: false, data: [], error: error.message };
  }
}

/**
 * Fetch jobs from multiple Greenhouse companies
 * @param {string[]} companies - Array of company board tokens
 * @returns {Promise<Array>} Combined array of opportunities
 */
export async function fetchGreenhouseOpportunities(companies) {
  logger.info(`Fetching from ${companies.length} Greenhouse companies`);

  const allOpportunities = [];
  const errors = [];

  for (const company of companies) {
    const result = await fetchGreenhouseCompany(company);

    if (result.success) {
      allOpportunities.push(...result.data);
    } else {
      errors.push({ company, error: result.error });
    }

    // Rate limiting: wait between companies
    await sleep(RATE_LIMIT_DELAY);
  }

  if (errors.length > 0) {
    logger.warn(`Failed to fetch from ${errors.length} companies`, { errors });
  }

  logger.info(`Total Greenhouse opportunities found: ${allOpportunities.length}`);
  return allOpportunities;
}

/**
 * Parse Greenhouse job into standardized opportunity format
 * @param {object} job - Raw Greenhouse job object
 * @param {string} company - Company identifier
 * @returns {object} Standardized opportunity object
 */
function parseGreenhouseJob(job, company) {
  // Detect job type from title or metadata
  const jobType = detectJobType(job);

  // Extract workplace type (on-site, hybrid, remote)
  const workplaceType = detectGreenhouseWorkplaceType(job);

  // Get location - extract from multiple offices if available
  const locationText = extractLocation(job);

  // Extract description preview (first 200 chars of plain text)
  const descriptionRaw = job.content || '';
  const descriptionPlain = decodeHtmlEntities(stripHtml(descriptionRaw));
  const descriptionPreview = descriptionPlain.slice(0, 200).trim();

  // Extract department for better company context
  const department = job.departments?.[0]?.name || null;

  return {
    source: 'greenhouse',
    source_id: job.id.toString(),
    internal_job_id: job.internal_job_id?.toString() || null,
    requisition_id: job.requisition_id || null,
    title: job.title,
    company: job.company_name || company,
    department,
    type: jobType,
    workplace_type: workplaceType,
    location_text: locationText,
    lat: null, // Will be geocoded later
    lon: null,
    distance_km: null,
    is_california: null,
    url: job.absolute_url,
    deadline: null, // Greenhouse doesn't provide deadline in API
    posted_at: job.updated_at, // Use updated_at as Greenhouse updates this field
    description_raw: descriptionRaw,
    description_preview: descriptionPreview,
    skills: extractSkills(descriptionRaw),
    compensation: extractCompensation(job),
    cc_friendly: 1, // Default to true, will be checked later
    cc_exclusion_reason: null,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    hash: null, // Will be computed during deduplication
    score: null, // Will be computed during scoring
  };
}

/**
 * Extract location from job object (handles multiple offices)
 * @param {object} job - Greenhouse job object
 * @returns {string} Location string
 */
function extractLocation(job) {
  if (job.offices && job.offices.length > 0) {
    // Use offices array for more detail
    const officeNames = job.offices.map(o => o.name).join('; ');
    return officeNames;
  }
  return job.location?.name || 'Not specified';
}

/**
 * Extract compensation if available
 * @param {object} job - Greenhouse job object
 * @returns {string|null} Compensation string
 */
function extractCompensation(_job) {
  // Greenhouse provides pay ranges in metadata or content
  // This would require parsing the content or checking metadata
  // For now, return null - can be enhanced later
  return null;
}

/**
 * Detect job type from title and metadata
 * @param {object} job - Greenhouse job object
 * @returns {string} 'internship', 'full-time', 'contract', 'part-time'
 */
function detectJobType(job) {
  // Check metadata first
  if (job.metadata) {
    for (const meta of job.metadata) {
      const name = meta.name.toLowerCase();
      if (name.includes('employment type') || name.includes('job type') || name.includes('commitment')) {
        const value = meta.value.toLowerCase();
        if (value.includes('intern') || value.includes('co-op')) return 'internship';
        if (value.includes('contract')) return 'contract';
        if (value.includes('part')) return 'part-time';
        if (value.includes('full')) return 'full-time';
      }
    }
  }

  // Check title
  const titleLower = job.title.toLowerCase();
  if (titleLower.includes('intern') || titleLower.includes('co-op')) {
    return 'internship';
  }
  if (titleLower.includes('contract')) {
    return 'contract';
  }
  if (titleLower.includes('part-time') || titleLower.includes('part time')) {
    return 'part-time';
  }

  // Default to full-time
  return 'full-time';
}

/**
 * Detect workplace type from Greenhouse job object
 * @param {object} job - Greenhouse job object
 * @returns {string} 'remote', 'hybrid', 'on-site'
 */
function detectGreenhouseWorkplaceType(job) {
  const locationText = (job.location?.name || '').toLowerCase();
  const officeNames = (job.offices || []).map(o => o.name.toLowerCase()).join(' ');
  return detectWorkplaceType(`${locationText} ${officeNames}`);
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ') // Remove scripts
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ') // Remove styles
    .replace(/<!--[\s\S]*?-->/g, ' ') // Remove comments
    .replace(/<[^>]+>/g, ' ') // Remove tags
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

/**
 * Decode HTML entities
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };

  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

