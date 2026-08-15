import { TOPIC_IDS, AUDIENCE_IDS } from '../constants.js';

/**
 * Deterministic stand-ins for the Gemini calls.
 *
 * The app must stay useful with no API key: these functions produce the same
 * shape as the model does, using sentence ranking and keyword rules instead of
 * an LLM. Anything produced here is tagged `model: 'rule-based'` so the UI can
 * be honest about where the summary came from.
 */

const TOPIC_KEYWORDS = {
  'jobs-market': ['vacanc', 'unemploy', 'hiring', 'redundan', 'labour market', 'job', 'recruit', 'workforce', 'employment rate'],
  'pay-rights': ['minimum wage', 'living wage', 'pay rise', 'salary', 'employment rights', 'tribunal', 'union', 'strike', 'sick pay', 'holiday pay', 'zero hours', 'flexible working'],
  education: ['school', 'pupil', 'ofsted', 'gcse', 'a-level', 'university', 'student', 'curriculum', 'exam', 'college'],
  'skills-training': ['skills', 'training', 'bootcamp', 'retrain', 'upskill', 'qualification', 'course', 'cpd'],
  apprenticeships: ['apprentice', 'levy', 't-level', 'traineeship'],
  graduates: ['graduate', 'undergraduate', 'placement year', 'internship', 'early career'],
  'benefits-welfare': ['universal credit', 'benefit', 'jobcentre', 'welfare', 'pip', 'pension credit', 'claimant'],
  // Work-related terms only — "asylum" or "small boats" alone is not a careers story.
  'immigration-visas': ['visa', 'skilled worker', 'sponsorship', 'sponsor licence', 'right to work', 'immigration rules', 'work permit', 'settlement'],
  economy: ['inflation', 'gdp', 'interest rate', 'budget', 'economy', 'growth', 'bank of england', 'recession', 'tax'],
  'public-sector': ['nhs', 'council', 'civil service', 'public sector', 'social care', 'police', 'teacher pay'],
  technology: ['ai ', 'artificial intelligence', 'tech', 'software', 'digital', 'cyber', 'automation', 'data centre'],
  business: ['business', 'firm', 'company', 'startup', 'sme', 'investment', 'trade'],
};

const AUDIENCE_KEYWORDS = {
  jobseekers: ['jobseeker', 'vacanc', 'hiring', 'unemploy', 'jobcentre', 'redundan'],
  students: ['student', 'school', 'pupil', 'college', 'gcse', 'a-level'],
  graduates: ['graduate', 'university', 'undergraduate', 'internship'],
  apprentices: ['apprentice', 'levy', 't-level'],
  'career-changers': ['retrain', 'bootcamp', 'career change', 'upskill'],
  employees: ['worker', 'employee', 'staff', 'pay', 'wage', 'workplace'],
  employers: ['employer', 'business', 'firm', 'company', 'hiring manager'],
  parents: ['childcare', 'parent', 'family', 'school place'],
  migrants: ['visa', 'immigration', 'sponsorship', 'migrant'],
};

const IMPORTANCE_KEYWORDS = [
  ['announce', 1],
  ['new law', 2],
  ['legislation', 2],
  ['comes into force', 2],
  ['from april', 1],
  ['budget', 1],
  ['consultation', 1],
  ['review', 0],
];

const splitSentences = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z£$0-9"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25);

const countMatches = (haystack, needles) =>
  needles.reduce((total, needle) => total + (haystack.includes(needle) ? 1 : 0), 0);

export const detectTopics = (text, hints = []) => {
  const haystack = ` ${String(text ?? '').toLowerCase()} `;
  const scored = Object.entries(TOPIC_KEYWORDS)
    .map(([topic, keywords]) => ({
      topic,
      score: countMatches(haystack, keywords) + (hints.includes(topic) ? 1.5 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.topic);

  const topics = scored.length > 0 ? scored : hints.slice(0, 2);
  return topics.filter((topic) => TOPIC_IDS.includes(topic));
};

export const detectAudience = (text, hints = []) => {
  const haystack = ` ${String(text ?? '').toLowerCase()} `;
  const scored = Object.entries(AUDIENCE_KEYWORDS)
    .map(([audience, keywords]) => ({
      audience,
      score: countMatches(haystack, keywords) + (hints.includes(audience) ? 1.5 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.audience);

  const audience = scored.length > 0 ? scored : hints.slice(0, 2);
  return audience.filter((entry) => AUDIENCE_IDS.includes(entry));
};

export const estimateImportance = (text, kind) => {
  const haystack = String(text ?? '').toLowerCase();
  const bonus = IMPORTANCE_KEYWORDS.reduce(
    (total, [needle, weight]) => total + (haystack.includes(needle) ? weight : 0),
    0,
  );
  return Math.min(5, Math.max(1, (kind === 'policy' ? 3 : 2) + Math.min(2, bonus)));
};

export const readingMinutes = (text) =>
  Math.max(1, Math.round(String(text ?? '').split(/\s+/).filter(Boolean).length / 200));

/**
 * Rank sentences by keyword density and position, then keep the top few in
 * their original order — a classic extractive summary.
 */
/** Cut to `limit` characters without slicing a word in half. */
const clamp = (text, limit) => {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
};

export const summariseExtractive = (text, { maxBullets = 3 } = {}) => {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    const trimmed = String(text ?? '').trim();
    return trimmed ? [clamp(trimmed, 220)] : [];
  }

  const allKeywords = Object.values(TOPIC_KEYWORDS).flat();
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score:
        countMatches(sentence.toLowerCase(), allKeywords) * 2 +
        (index === 0 ? 3 : 0) +
        (/\d/.test(sentence) ? 1 : 0) -
        index * 0.2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBullets)
    .sort((a, b) => a.index - b.index);

  return ranked.map((entry) => clamp(entry.sentence, 240));
};

const IMPACT_BY_TOPIC = {
  'jobs-market': 'Watch how this shifts the number of openings in your sector before you plan your next move.',
  'pay-rights': 'This can change what you are legally owed at work — check your contract and payslip against it.',
  education: 'Relevant if you are studying, supporting a student, or planning a return to education.',
  'skills-training': 'There may be a funded course or training route here you can use.',
  apprenticeships: 'Useful if you are considering an apprenticeship or already on one.',
  graduates: 'Directly relevant to graduate schemes and first roles after university.',
  'benefits-welfare': 'Could affect what support you can claim while looking for or changing work.',
  'immigration-visas': 'Check this against your visa route or your employer sponsorship before acting.',
  economy: 'Background conditions here feed through to hiring budgets and pay reviews.',
  'public-sector': 'Relevant if you work in, or are applying to, the NHS, councils or the civil service.',
  technology: 'Consider what this means for the skills employers will ask for next.',
  business: 'Useful context if you run a business or work for a smaller employer.',
};

export const impactFor = (topics, kind) => {
  const primary = topics[0];
  return (
    IMPACT_BY_TOPIC[primary] ??
    (kind === 'policy'
      ? 'An official update worth knowing about if it touches your sector.'
      : 'General career context — useful background rather than an immediate action.')
  );
};

const ACTION_BY_TOPIC = {
  'jobs-market': 'Set a job alert for your role and region in the Jobs tab.',
  'pay-rights': 'Compare the change against your current contract.',
  education: 'Note any deadline dates that apply to you.',
  'skills-training': 'Search the funded courses mentioned before the window closes.',
  apprenticeships: 'Check whether you meet the eligibility rules.',
  graduates: 'Line your CV up against the schemes now opening.',
  'benefits-welfare': 'Check your entitlement on GOV.UK if this applies to you.',
  'immigration-visas': 'Confirm your route is unaffected before making plans.',
  economy: 'No action needed — keep it in mind at your next pay review.',
  'public-sector': 'Watch for related vacancies in the coming weeks.',
  technology: 'Ask the coach which of these skills is worth learning first.',
  business: 'Consider how this affects the employers you are targeting.',
};

export const actionFor = (topics) => ACTION_BY_TOPIC[topics[0]] ?? 'Read the full source if it applies to you.';

/** Headline rewrite without a model: trim publisher furniture and clamp length. */
export const tidyHeadline = (title) => {
  const cleaned = String(title ?? '')
    .replace(/\s*[-|–]\s*(BBC News|The Guardian|Sky News|GOV\.UK|Personnel Today).*$/i, '')
    .trim();
  return cleaned.length > 110 ? `${cleaned.slice(0, 107)}...` : cleaned;
};
