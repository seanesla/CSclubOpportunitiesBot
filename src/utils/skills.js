/**
 * Shared skill extraction from job descriptions
 * Single source of truth for skill pattern matching
 */

const SKILL_PATTERNS = [
  { name: 'JavaScript', regex: /\bjavascript\b/i },
  { name: 'TypeScript', regex: /\btypescript\b/i },
  { name: 'Python', regex: /\bpython\b/i },
  { name: 'Java', regex: /\bjava\b(?!script)/i },
  { name: 'C++', regex: /\bc\+\+\b/i },
  { name: 'C#', regex: /\bc#\b/i },
  { name: 'Ruby', regex: /\bruby\b/i },
  { name: 'Go', regex: /\bgolang\b|\bgo\b(?!\s+to|\s+for)/i },
  { name: 'Rust', regex: /\brust\b/i },
  { name: 'Swift', regex: /\bswift\b/i },
  { name: 'Kotlin', regex: /\bkotlin\b/i },
  { name: 'React', regex: /\breact(\.js)?\b/i },
  { name: 'Vue', regex: /\bvue(\.js)?\b/i },
  { name: 'Angular', regex: /\bangular\b/i },
  { name: 'Node.js', regex: /\bnode(\.js)?\b/i },
  { name: 'Django', regex: /\bdjango\b/i },
  { name: 'Flask', regex: /\bflask\b/i },
  { name: 'Spring', regex: /\bspring(\s+boot)?\b/i },
  { name: 'Express', regex: /\bexpress(\.js)?\b/i },
  { name: 'AWS', regex: /\baws\b|\bamazon\s+web\s+services\b/i },
  { name: 'Azure', regex: /\bazure\b/i },
  { name: 'GCP', regex: /\bgcp\b|\bgoogle\s+cloud\b/i },
  { name: 'Docker', regex: /\bdocker\b/i },
  { name: 'Kubernetes', regex: /\bkubernetes\b|\bk8s\b/i },
  { name: 'Git', regex: /\bgit\b(?!hub|\slab)/i },
  { name: 'SQL', regex: /\bsql\b/i },
  { name: 'NoSQL', regex: /\bnosql\b/i },
  { name: 'MongoDB', regex: /\bmongodb\b/i },
  { name: 'PostgreSQL', regex: /\bpostgresql\b|\bpostgres\b/i },
  { name: 'Machine Learning', regex: /\bmachine\s+learning\b|\bml\b/i },
  { name: 'AI', regex: /\bartificial\s+intelligence\b|\bai\b/i },
  { name: 'Data Science', regex: /\bdata\s+science\b/i },
  { name: 'DevOps', regex: /\bdevops\b/i },
  { name: 'CI/CD', regex: /\bci\/cd\b|\bcontinuous\s+integration\b/i },
];

/**
 * Extract technical skills from a job description
 * @param {string} description - Job description text (may contain HTML)
 * @returns {string[]} Array of matched skill names
 */
export function extractSkills(description) {
  if (!description) return [];

  const foundSkills = new Set();
  const descriptionLower = description.toLowerCase();

  for (const { name, regex } of SKILL_PATTERNS) {
    if (regex.test(descriptionLower)) {
      foundSkills.add(name);
    }
  }

  return Array.from(foundSkills);
}
