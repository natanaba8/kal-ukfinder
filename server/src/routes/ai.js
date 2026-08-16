import { Router } from 'express';
import { z } from 'zod';

import { askCoach, prepareInterview, reviewCv, scoreAnswer } from '../ai/coach.js';
import { actingUser, optionalAuth } from '../auth/guard.js';
import { aiLimiter } from '../middleware/rate-limit.js';
import { isAiEnabled } from '../ai/gemini.js';
import { config } from '../config.js';
import { rankedForProfile } from '../store/items.js';
import { appendMessage, clearThread, threadMessages } from '../store/users.js';

export const aiRouter = Router();

// The coach personalises on the signed-in user; a legacy `userId` still works
// for anonymous installs. AI calls cost money, so they are rate limited.
aiRouter.use(optionalAuth);

aiRouter.get('/ai/status', (request, response) => {
  response.json({
    enabled: isAiEnabled(),
    mode: isAiEnabled() ? 'gemini' : 'rule-based',
    models: isAiEnabled() ? { fast: config.ai.fastModel, smart: config.ai.smartModel } : null,
    note: isAiEnabled()
      ? null
      : 'No GEMINI_API_KEY configured — answers come from the built-in UK careers guidance instead.',
  });
});

// --- Q&A career coach -------------------------------------------------------

const askSchema = z.object({
  userId: z.string().optional(),
  question: z.string().min(3).max(4000),
  useBriefingContext: z.boolean().default(true),
});

aiRouter.post('/ai/ask', aiLimiter, async (request, response) => {
  const body = askSchema.parse(request.body);
  const user = await actingUser(request);

  const history = user
    ? (await threadMessages(user.id, 'coach', 10)).map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        text: message.content,
      }))
    : [];

  const context =
    user && body.useBriefingContext
      ? (await rankedForProfile(user.profile, { limit: 5 })).map((item) => ({
          title: item.headline,
          source: item.source.name,
          url: item.url,
          summary: item.summary.join(' '),
        }))
      : [];

  const result = await askCoach({
    question: body.question,
    profile: user?.profile,
    history,
    context,
  });

  if (user) {
    await appendMessage({ userId: user.id, thread: 'coach', role: 'user', content: body.question });
    await appendMessage({
      userId: user.id,
      thread: 'coach',
      role: 'assistant',
      content: result.answer,
      meta: { followUps: result.followUps, checkWith: result.checkWith, model: result.model },
    });
  }

  response.json(result);
});

/** Coach history is personal — a signed-in user only ever sees their own. */
const ownThread = (request, response, next) => {
  if (request.auth && request.auth.userId !== request.params.userId) {
    return response.status(403).json({ error: 'That is not your conversation', code: 'FORBIDDEN' });
  }
  return next();
};

aiRouter.get('/ai/thread/:userId', ownThread, async (request, response) => {
  const thread = String(request.query.thread ?? 'coach');
  response.json({ messages: await threadMessages(request.params.userId, thread) });
});

aiRouter.delete('/ai/thread/:userId', ownThread, async (request, response) => {
  const thread = String(request.query.thread ?? 'coach');
  response.json({ deleted: await clearThread(request.params.userId, thread) });
});

// --- CV review --------------------------------------------------------------

const cvSchema = z.object({
  userId: z.string().optional(),
  cvText: z.string().min(80, 'Paste at least a paragraph of your CV').max(40000),
  targetRole: z.string().max(200).optional(),
  jobAdvert: z.string().max(20000).optional(),
});

aiRouter.post('/ai/cv-review', aiLimiter, async (request, response) => {
  const body = cvSchema.parse(request.body);
  const user = await actingUser(request);

  const result = await reviewCv({
    cvText: body.cvText,
    targetRole: body.targetRole,
    jobAdvert: body.jobAdvert,
    profile: user?.profile,
  });

  if (user) {
    await appendMessage({
      userId: user.id,
      thread: 'cv',
      role: 'assistant',
      content: result.verdict,
      meta: { score: result.score, targetRole: body.targetRole ?? null, model: result.model },
    });
  }

  response.json(result);
});

// --- Interview prep ---------------------------------------------------------

const interviewSchema = z.object({
  userId: z.string().optional(),
  role: z.string().min(2).max(200),
  employer: z.string().max(200).optional(),
  stage: z.string().max(120).optional(),
  jobAdvert: z.string().max(20000).optional(),
});

aiRouter.post('/ai/interview', aiLimiter, async (request, response) => {
  const body = interviewSchema.parse(request.body);
  const user = await actingUser(request);

  const result = await prepareInterview({
    role: body.role,
    employer: body.employer,
    stage: body.stage,
    jobAdvert: body.jobAdvert,
    profile: user?.profile,
  });

  response.json(result);
});

const answerSchema = z.object({
  question: z.string().min(5).max(1000),
  answer: z.string().min(20).max(8000),
  role: z.string().max(200).optional(),
});

aiRouter.post('/ai/interview/feedback', aiLimiter, async (request, response) => {
  const body = answerSchema.parse(request.body);
  response.json(await scoreAnswer(body));
});
