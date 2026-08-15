/**
 * Mechanical CV checks that do not need a model.
 *
 * Used on its own when Gemini is not configured, and fed to Gemini as a
 * starting point when it is — so the model spends its attention on judgement
 * rather than counting words.
 */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'will', 'are', 'our', 'this', 'that', 'have', 'has',
  'from', 'they', 'their', 'them', 'about', 'into', 'role', 'work', 'working', 'job', 'team', 'teams',
  'within', 'across', 'also', 'able', 'must', 'should', 'would', 'been', 'were', 'was', 'who', 'all',
  'any', 'can', 'not', 'but', 'out', 'per', 'via', 'well', 'more', 'most', 'other', 'such', 'each',
  'company', 'candidate', 'candidates', 'applicants', 'apply', 'salary', 'benefits', 'experience',
  'skills', 'ability', 'looking', 'join', 'help', 'support', 'ensure', 'including', 'essential',
  'desirable', 'requirements', 'responsibilities', 'opportunity', 'excellent', 'strong', 'good',
]);

const WEAK_OPENERS = [
  'responsible for',
  'duties included',
  'duties involved',
  'tasked with',
  'helped with',
  'worked on',
  'assisted with',
  'involved in',
  'in charge of',
];

const AMERICANISMS = [
  ['organize', 'organise'],
  ['organized', 'organised'],
  ['analyze', 'analyse'],
  ['analyzed', 'analysed'],
  ['optimize', 'optimise'],
  ['optimized', 'optimised'],
  ['recognize', 'recognise'],
  ['program ', 'programme '],
  ['color', 'colour'],
  ['center', 'centre'],
  ['favorite', 'favourite'],
  ['resume', 'CV'],
  ['math ', 'maths '],
];

/** A bullet "carries a number" if it has money, a percentage, or a counted noun. */
const QUANTIFIED =
  /(£\s?[\d,]+)|(\b\d+(\.\d+)?\s?%)|(\b\d[\d,]*\s?(k\b|m\b|people|staff|clients|customers|students|patients|cases|calls|hours|days|weeks|months|users|accounts|sites|projects|tickets))/i;

const SECTION_PATTERNS = {
  personalStatement: /\b(personal statement|profile|professional summary|about me|summary)\b/i,
  experience: /\b(work experience|employment history|professional experience|experience)\b/i,
  education: /\b(education|qualifications|academic)\b/i,
  skills: /\b(skills|technical skills|key skills|competenc)\b/i,
};

const keywordsFrom = (text, limit = 40) => {
  const counts = new Map();
  for (const word of String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)) {
    if (word.length < 3 || STOP_WORDS.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
};

export const cvHeuristics = ({ cvText, targetRole, jobAdvert }) => {
  const text = String(cvText ?? '');
  const lower = text.toLowerCase();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean).length;
  const estimatedPages = Math.max(1, Math.round(words / 500));

  const improvements = [];
  const strengths = [];
  const atsNotes = [];

  // --- length -------------------------------------------------------------
  if (words < 200) {
    improvements.push({
      issue: 'The CV is very short',
      why: 'Under roughly 200 words there is not enough evidence for a recruiter to shortlist you.',
      fix: 'Add three to five achievement bullets per recent role, each with what you did and the result.',
      severity: 'high',
    });
  } else if (estimatedPages > 2) {
    improvements.push({
      issue: `Roughly ${estimatedPages} pages of content`,
      why: 'UK recruiters expect two pages maximum, one if you are early career.',
      fix: 'Cut roles older than 10 years to a single line and remove duties that repeat across jobs.',
      severity: 'medium',
    });
  } else {
    strengths.push(`Length looks right for the UK market (about ${estimatedPages} page${estimatedPages === 1 ? '' : 's'}).`);
  }

  // --- contact details ----------------------------------------------------
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const hasPhone = /(\+44|0)\s?\d[\d\s-]{8,}/.test(text);
  if (!hasEmail || !hasPhone) {
    improvements.push({
      issue: `Missing ${!hasEmail && !hasPhone ? 'email address and phone number' : !hasEmail ? 'an email address' : 'a phone number'}`,
      why: 'Recruiters will not chase you for contact details — the application simply stops there.',
      fix: 'Put your name, city, phone and a professional email address on the first two lines.',
      severity: 'high',
    });
  } else {
    strengths.push('Contact details are present and easy to find.');
  }

  if (/\b(date of birth|d\.o\.b|marital status|nationality:|photo attached)\b/i.test(text)) {
    improvements.push({
      issue: 'Personal details that UK CVs should not include',
      why: 'Date of birth, marital status and photos invite bias and are not expected on a UK CV.',
      fix: 'Delete them. Keep only name, location, phone, email and (optionally) a LinkedIn URL.',
      severity: 'medium',
    });
  }

  // --- structure ----------------------------------------------------------
  const missingSections = Object.entries(SECTION_PATTERNS)
    .filter(([, pattern]) => !pattern.test(text))
    .map(([section]) => section);

  if (missingSections.includes('personalStatement')) {
    improvements.push({
      issue: 'No personal statement at the top',
      why: 'The first six seconds of a screen decide whether the rest gets read.',
      fix: 'Add three or four lines: who you are, your strongest relevant evidence, and the role you want.',
      severity: 'high',
    });
  }
  if (missingSections.includes('skills')) {
    improvements.push({
      issue: 'No dedicated skills section',
      why: 'Applicant tracking systems match on skill keywords, and screeners scan for them.',
      fix: 'Add a short skills block listing the tools, systems and certifications named in the advert.',
      severity: 'medium',
    });
  }
  if (missingSections.includes('education')) {
    improvements.push({
      issue: 'No education or qualifications section',
      why: 'Many UK roles filter on a minimum qualification, including apprenticeships and NVQs.',
      fix: 'Add education with dates, most recent first. Include in-progress study with an expected date.',
      severity: 'medium',
    });
  }
  if (missingSections.length === 0) {
    strengths.push('All four expected sections are present: statement, experience, education and skills.');
  }

  // --- writing quality ----------------------------------------------------
  const weakFound = WEAK_OPENERS.filter((opener) => lower.includes(opener));
  if (weakFound.length > 0) {
    improvements.push({
      issue: `Duty-based phrasing (${weakFound.slice(0, 3).map((phrase) => `"${phrase.trim()}"`).join(', ')})`,
      why: 'It describes the job description rather than what you personally achieved.',
      fix: 'Rewrite as action + result: "Cut invoice errors by 30% by rebuilding the checking process".',
      severity: 'high',
    });
  }

  const numberLines = lines.filter((line) => QUANTIFIED.test(line));
  if (numberLines.length < 3) {
    improvements.push({
      issue: 'Very few measurable results',
      why: 'Quantified bullets are the single strongest differentiator at shortlisting.',
      fix: 'Add numbers to at least three bullets — volume handled, time saved, money saved, satisfaction scores.',
      severity: 'high',
    });
  } else {
    strengths.push(`${numberLines.length} bullets carry a number — that is what shortlisters look for.`);
  }

  const americanisms = AMERICANISMS.filter(([us]) => lower.includes(us));
  if (americanisms.length > 0) {
    improvements.push({
      issue: 'American spellings',
      why: 'UK employers notice, and it reads as a CV copied from elsewhere without tailoring.',
      fix: `Change ${americanisms
        .slice(0, 4)
        .map(([us, uk]) => `"${us.trim()}" to "${uk.trim()}"`)
        .join(', ')}.`,
      severity: 'low',
    });
  }

  if (/\bi am\b|\bi have\b|\bi was\b/gi.test(text) && (text.match(/\bi\s/gi) ?? []).length > 12) {
    improvements.push({
      issue: 'Heavy use of "I" throughout',
      why: 'UK CVs usually drop the pronoun outside the personal statement to save space.',
      fix: 'Start bullets with the verb: "Led", "Built", "Reduced" rather than "I led", "I built".',
      severity: 'low',
    });
  }

  // --- keyword gap --------------------------------------------------------
  const advertText = [jobAdvert, targetRole].filter(Boolean).join(' ');
  const advertKeywords = keywordsFrom(advertText, 30);
  const cvKeywords = new Set(keywordsFrom(text, 200));
  const missingKeywords = advertKeywords.filter((word) => !cvKeywords.has(word)).slice(0, 12);

  if (advertText && missingKeywords.length > 0) {
    improvements.push({
      issue: `${missingKeywords.length} keywords from the advert are missing`,
      why: 'Screening software ranks on exact term matches before a human ever reads it.',
      fix: `Work these in honestly where you have the evidence: ${missingKeywords.slice(0, 8).join(', ')}.`,
      severity: 'high',
    });
  }

  // --- ATS ----------------------------------------------------------------
  atsNotes.push('Send a .docx or a text-based .pdf — scanned images cannot be parsed.');
  atsNotes.push('Avoid tables, text boxes and multi-column layouts; they scramble in most parsers.');
  atsNotes.push('Use standard headings ("Work Experience", not "My Journey") so sections are recognised.');
  if (/\bskype\b|\bfax\b/i.test(text)) atsNotes.push('Remove dated contact methods such as fax or Skype.');

  // --- score --------------------------------------------------------------
  const penalty = improvements.reduce(
    (total, entry) => total + (entry.severity === 'high' ? 14 : entry.severity === 'medium' ? 8 : 3),
    0,
  );
  const score = Math.max(15, Math.min(96, 92 - penalty + Math.min(8, strengths.length * 2)));

  const topSkills = keywordsFrom(text, 8).slice(0, 4);
  const rewrittenSummary = targetRole
    ? `[Template — add a Gemini API key for a tailored rewrite] ` +
      `A ${targetRole} with hands-on experience in ${topSkills.slice(0, 3).join(', ') || 'your core areas'}. ` +
      `Known for [your strongest measurable result — include the number]. Now looking for a ${targetRole} role where ` +
      `[what you want to do next], bringing [the one skill the advert asks for most].`
    : 'Add a target role to get a personal statement template you can adapt.';

  return {
    score,
    verdict:
      score >= 80
        ? 'Strong CV — a few refinements away from ready.'
        : score >= 60
          ? 'Solid base, but it will lose out to tailored applications until the high-severity items are fixed.'
          : 'Needs work before applying — the issues below are the ones costing you interviews.',
    strengths: strengths.length > 0 ? strengths : ['You have a CV to work from — that is the hard part done.'],
    improvements: improvements.sort(
      (a, b) =>
        ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity),
    ),
    rewrittenSummary,
    missingKeywords,
    atsNotes,
    stats: {
      words,
      estimatedPages,
      bulletsWithNumbers: numberLines.length,
      hasEmail,
      hasPhone,
      missingSections,
    },
  };
};
