import { Type } from '@google/genai';

import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { cvHeuristics } from './cv-heuristics.js';
import { generateJson, generateText, isAiEnabled } from './gemini.js';
import { COACH_SYSTEM, CV_SYSTEM, INTERVIEW_SYSTEM, MATCH_SYSTEM } from './prompts.js';
import { OFFLINE_ANSWERS, INTERVIEW_BANK } from './knowledge.js';

const log = createLogger('coach');

const profileBrief = (profile = {}) => {
  const parts = [
    profile.headline && `Current role/goal: ${profile.headline}`,
    profile.experienceLevel && `Experience level: ${profile.experienceLevel}`,
    profile.sector && `Sector: ${profile.sector}`,
    profile.location && `Location: ${profile.location}`,
    profile.skills?.length && `Skills: ${profile.skills.join(', ')}`,
    profile.topics?.length && `Interested in: ${profile.topics.join(', ')}`,
    profile.rightToWork && `Right to work status: ${profile.rightToWork}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('\n') : 'No profile details supplied.';
};

// ---------------------------------------------------------------------------
// Q&A career coach
// ---------------------------------------------------------------------------

const ASK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    followUps: { type: Type.ARRAY, items: { type: Type.STRING } },
    checkWith: { type: Type.STRING },
  },
  required: ['answer', 'followUps'],
};

/**
 * @param {object} input
 * @param {string} input.question
 * @param {object} [input.profile]
 * @param {Array<{role: 'user'|'assistant', content: string}>} [input.history]
 * @param {Array<{title: string, source: string, url: string, summary: string}>} [input.context]
 */
export const askCoach = async ({ question, profile, history = [], context = [] }) => {
  if (!isAiEnabled()) return offlineAnswer(question);

  const contextBlock =
    context.length > 0
      ? `\n\nRecent Kal-UKFinder briefings that may be relevant (cite them by title only if you use them):\n${context
          .map((entry) => `- ${entry.title} (${entry.source}): ${entry.summary}`)
          .join('\n')}`
      : '';

  const prompt = `The person asking:\n${profileBrief(profile)}\n\nTheir question:\n"""${question}"""${contextBlock}

Answer them directly. Then give up to three short follow-up questions they could usefully ask next.
Set "checkWith" only if they should verify with an official body (e.g. "GOV.UK — Universal Credit", "ACAS").`;

  try {
    const result = await generateJson({
      model: config.ai.smartModel,
      system: COACH_SYSTEM,
      prompt,
      schema: ASK_SCHEMA,
      temperature: 0.6,
      maxOutputTokens: 1600,
    });

    return {
      answer: result.answer,
      followUps: (result.followUps ?? []).slice(0, 3),
      checkWith: result.checkWith || null,
      model: config.ai.smartModel,
    };
  } catch (error) {
    log.warn(`askCoach fell back: ${error.message}`);
    return offlineAnswer(question);
  }
};

/** Keyword-routed guidance so the Q&A tab still helps without an API key. */
const offlineAnswer = (question) => {
  const haystack = question.toLowerCase();
  const match =
    OFFLINE_ANSWERS.find((entry) => entry.triggers.some((trigger) => haystack.includes(trigger))) ??
    OFFLINE_ANSWERS.find((entry) => entry.id === 'default');

  return {
    answer: match.answer,
    followUps: match.followUps ?? [],
    checkWith: match.checkWith ?? null,
    model: 'rule-based',
  };
};

// ---------------------------------------------------------------------------
// CV review
// ---------------------------------------------------------------------------

const CV_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    verdict: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING },
          why: { type: Type.STRING },
          fix: { type: Type.STRING },
          severity: { type: Type.STRING },
        },
        required: ['issue', 'why', 'fix', 'severity'],
      },
    },
    rewrittenSummary: { type: Type.STRING },
    missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    atsNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['score', 'verdict', 'strengths', 'improvements', 'rewrittenSummary'],
};

export const reviewCv = async ({ cvText, targetRole, jobAdvert, profile }) => {
  const heuristics = cvHeuristics({ cvText, targetRole, jobAdvert });

  if (!isAiEnabled()) return { ...heuristics, model: 'rule-based' };

  const prompt = `Target role: ${targetRole || 'not specified'}
Candidate context:
${profileBrief(profile)}
${jobAdvert ? `\nJob advert they are applying to:\n"""${jobAdvert.slice(0, 4000)}"""` : ''}

Their CV:
"""${cvText.slice(0, 12000)}"""

Automated checks already found these mechanical issues — confirm, correct or drop them, and add what a
human reviewer would notice: ${heuristics.improvements.map((entry) => entry.issue).join('; ') || 'none'}

Return a score out of 100 for how ready this CV is for the target role, a one-line verdict, what genuinely
works, prioritised improvements (severity: high | medium | low), a rewritten personal statement of 3-4
lines in their own voice, and keywords from the advert that are missing from the CV.`;

  try {
    const result = await generateJson({
      model: config.ai.smartModel,
      system: CV_SYSTEM,
      prompt,
      schema: CV_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 2600,
    });

    return {
      score: Math.min(100, Math.max(0, Number(result.score) || heuristics.score)),
      verdict: result.verdict,
      strengths: result.strengths ?? [],
      improvements: result.improvements ?? [],
      rewrittenSummary: result.rewrittenSummary ?? '',
      missingKeywords: result.missingKeywords ?? heuristics.missingKeywords,
      atsNotes: result.atsNotes ?? heuristics.atsNotes,
      stats: heuristics.stats,
      model: config.ai.smartModel,
    };
  } catch (error) {
    log.warn(`reviewCv fell back: ${error.message}`);
    return { ...heuristics, model: 'rule-based' };
  }
};

// ---------------------------------------------------------------------------
// Interview preparation
// ---------------------------------------------------------------------------

const INTERVIEW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    format: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          type: { type: Type.STRING },
          whyAsked: { type: Type.STRING },
          strongAnswerContains: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['question', 'type', 'whyAsked', 'strongAnswerContains'],
      },
    },
    questionsToAskThem: { type: Type.ARRAY, items: { type: Type.STRING } },
    preparationChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['format', 'questions', 'questionsToAskThem', 'preparationChecklist'],
};

export const prepareInterview = async ({ role, employer, stage, profile, jobAdvert }) => {
  if (!isAiEnabled()) return offlineInterview({ role, stage });

  const prompt = `Role: ${role}
Employer: ${employer || 'not specified'}
Stage: ${stage || 'first interview'}
Candidate context:
${profileBrief(profile)}
${jobAdvert ? `\nJob advert:\n"""${jobAdvert.slice(0, 3000)}"""` : ''}

Give the likely interview format, eight questions they should prepare (mix of competency, technical and
motivational, tagged in "type"), what a strong answer contains for each, three sharp questions for them to
ask the interviewer, and a short preparation checklist for the days before.`;

  try {
    const result = await generateJson({
      model: config.ai.smartModel,
      system: INTERVIEW_SYSTEM,
      prompt,
      schema: INTERVIEW_SCHEMA,
      temperature: 0.6,
      maxOutputTokens: 2600,
    });
    return { ...result, model: config.ai.smartModel };
  } catch (error) {
    log.warn(`prepareInterview fell back: ${error.message}`);
    return offlineInterview({ role, stage });
  }
};

const offlineInterview = ({ role, stage }) => {
  const family =
    INTERVIEW_BANK.find((entry) => entry.match.some((needle) => (role ?? '').toLowerCase().includes(needle))) ??
    INTERVIEW_BANK.find((entry) => entry.id === 'general');

  return {
    format: family.format,
    questions: family.questions,
    questionsToAskThem: family.questionsToAskThem,
    preparationChecklist: [
      `Re-read the advert for "${role || 'the role'}" and highlight every requirement — prepare one example each.`,
      'Write your examples in STAR order: Situation, Task, Action, Result. Keep each to 90 seconds.',
      'Have two numbers ready: something you improved and by how much.',
      stage?.toLowerCase().includes('final')
        ? 'Prepare your salary expectation as a researched range, not a single figure.'
        : 'Check the interview format and who you are meeting.',
      'Test your kit if it is a video interview and have your CV on screen.',
    ],
    model: 'rule-based',
  };
};

const FEEDBACK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    whatWorked: { type: Type.ARRAY, items: { type: Type.STRING } },
    whatToImprove: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingFromStar: { type: Type.ARRAY, items: { type: Type.STRING } },
    modelAnswer: { type: Type.STRING },
  },
  required: ['score', 'whatWorked', 'whatToImprove', 'modelAnswer'],
};

export const scoreAnswer = async ({ question, answer, role }) => {
  if (!isAiEnabled()) return offlineAnswerFeedback({ answer });

  const prompt = `Interview question: "${question}"
Role: ${role || 'not specified'}

The candidate's answer:
"""${answer.slice(0, 6000)}"""

Score it out of 10 for a UK interview panel. Say what worked, what to improve, which STAR elements are
missing, and rewrite it as a model answer that keeps their own facts and voice.`;

  try {
    const result = await generateJson({
      model: config.ai.smartModel,
      system: INTERVIEW_SYSTEM,
      prompt,
      schema: FEEDBACK_SCHEMA,
      temperature: 0.5,
      maxOutputTokens: 1800,
    });
    return { ...result, model: config.ai.smartModel };
  } catch (error) {
    log.warn(`scoreAnswer fell back: ${error.message}`);
    return offlineAnswerFeedback({ answer });
  }
};

const offlineAnswerFeedback = ({ answer }) => {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasNumbers = /\d/.test(answer);
  const hasResult = /\b(result|outcome|led to|meant that|saved|increased|reduced|improved)\b/i.test(answer);
  const hasI = /\bI\b/.test(answer);

  const missing = [];
  if (!/\b(when|while|at|during)\b/i.test(answer)) missing.push('Situation — set the scene in one sentence');
  if (!/\b(needed|had to|asked me|responsible)\b/i.test(answer)) missing.push('Task — what you were responsible for');
  if (!hasI) missing.push('Action — say "I" not "we"; the panel is scoring you');
  if (!hasResult) missing.push('Result — how it ended and what changed');

  const score = Math.max(2, 10 - missing.length * 1.5 - (words < 60 ? 2 : 0) - (hasNumbers ? 0 : 1));

  return {
    score: Math.round(score),
    whatWorked: [
      words >= 60 ? 'Good length — enough detail to score against.' : 'Clear and concise.',
      hasNumbers ? 'You included a concrete number, which panels remember.' : 'You answered the question asked.',
    ],
    whatToImprove: [
      ...missing,
      hasNumbers ? 'Add a second measurable detail if you have one.' : 'Add one number: time saved, volume handled, or score improved.',
      words > 320 ? 'Trim it — aim for 90 seconds spoken, roughly 200 words.' : 'Practise saying it aloud once to check the pace.',
    ],
    missingFromStar: missing,
    modelAnswer:
      'Add an API key to get a rewritten model answer. In the meantime, restructure your answer as: one sentence of context, one sentence on what you were asked to do, three sentences on what you personally did, then the result with a number.',
    model: 'rule-based',
  };
};

// ---------------------------------------------------------------------------
// Job matching
// ---------------------------------------------------------------------------

const MATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          score: { type: Type.INTEGER },
          reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
          gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['id', 'score', 'reasons', 'gaps'],
      },
    },
  },
  required: ['matches'],
};

/** Cheap lexical fit used on its own without AI, and as a prior with it. */
export const scoreJobLexically = (job, profile = {}) => {
  const wanted = [
    ...(profile.skills ?? []),
    ...(profile.jobTitles ?? []),
    profile.headline ?? '',
    profile.sector ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 2);

  const haystack = `${job.title} ${job.company} ${job.category} ${job.description}`.toLowerCase();
  const hits = [...new Set(wanted)].filter((word) => haystack.includes(word));

  let score = Math.min(70, hits.length * 12);
  if (profile.location && `${job.location} ${job.region}`.toLowerCase().includes(profile.location.toLowerCase())) {
    score += 15;
  }
  if (profile.remoteOnly && job.remote) score += 10;
  if (profile.salaryMin && (job.salaryMax ?? job.salaryMin ?? 0) >= profile.salaryMin) score += 10;

  return {
    id: job.id,
    score: Math.min(100, score),
    reasons: hits.slice(0, 4).map((word) => `Matches your "${word}"`),
    gaps: profile.salaryMin && (job.salaryMax ?? 0) < profile.salaryMin ? ['Below your salary floor'] : [],
  };
};

export const matchJobs = async ({ jobs, profile }) => {
  const lexical = jobs.map((job) => scoreJobLexically(job, profile));
  if (!isAiEnabled() || jobs.length === 0) {
    return lexical.sort((a, b) => b.score - a.score).map((entry) => ({ ...entry, model: 'rule-based' }));
  }

  const prompt = `Candidate:
${profileBrief(profile)}
${profile?.salaryMin ? `Minimum salary: £${profile.salaryMin}` : ''}
${profile?.remoteOnly ? 'Needs remote or hybrid.' : ''}

Vacancies:
${jobs
  .slice(0, 20)
  .map(
    (job) =>
      `- id: ${job.id}\n  title: ${job.title}\n  employer: ${job.company}\n  location: ${job.location}${
        job.remote ? ' (remote/hybrid)' : ''
      }\n  salary: ${job.salaryText ?? 'not stated'}\n  detail: ${(job.description ?? '').slice(0, 400)}`,
  )
  .join('\n')}

Score each vacancy for this candidate. Return every id you were given.`;

  try {
    const result = await generateJson({
      model: config.ai.fastModel,
      system: MATCH_SYSTEM,
      prompt,
      schema: MATCH_SCHEMA,
      temperature: 0.3,
      maxOutputTokens: 2600,
    });

    const byId = new Map((result.matches ?? []).map((match) => [match.id, match]));
    return lexical
      .map((entry) => {
        const ai = byId.get(entry.id);
        return ai
          ? { id: entry.id, score: Math.min(100, Number(ai.score) || entry.score), reasons: ai.reasons ?? [], gaps: ai.gaps ?? [], model: config.ai.fastModel }
          : { ...entry, model: 'rule-based' };
      })
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    log.warn(`matchJobs fell back: ${error.message}`);
    return lexical.sort((a, b) => b.score - a.score).map((entry) => ({ ...entry, model: 'rule-based' }));
  }
};

// ---------------------------------------------------------------------------
// Digest copywriting (used by the notification scheduler)
// ---------------------------------------------------------------------------

export const writeDigestLine = async ({ items, profile }) => {
  const headlines = items.map((item) => item.aiHeadline || item.title);
  const fallback = {
    title: `Your UK briefing: ${headlines.length} update${headlines.length === 1 ? '' : 's'}`,
    body: headlines.slice(0, 2).join(' · ').slice(0, 160),
  };

  if (!isAiEnabled() || headlines.length === 0) return fallback;

  try {
    const text = await generateText({
      model: config.ai.fastModel,
      system: COACH_SYSTEM,
      prompt: `Write a push notification for this person:\n${profileBrief(profile)}\n\nToday's items:\n${headlines
        .map((headline) => `- ${headline}`)
        .join('\n')}\n\nReturn exactly two lines: line 1 is a title of at most 45 characters, line 2 is a body of at most 120 characters. No quotes, no emoji spam (one emoji maximum).`,
      temperature: 0.8,
      maxOutputTokens: 200,
    });

    const [title, ...rest] = text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!title || rest.length === 0) return fallback;
    return { title: title.slice(0, 60), body: rest.join(' ').slice(0, 160) };
  } catch (error) {
    log.warn(`writeDigestLine fell back: ${error.message}`);
    return fallback;
  }
};
