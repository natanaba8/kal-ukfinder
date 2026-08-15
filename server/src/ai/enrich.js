import { Type } from '@google/genai';

import { config } from '../config.js';
import { TOPIC_IDS, AUDIENCE_IDS } from '../constants.js';
import { createLogger } from '../logger.js';
import * as rules from './fallback.js';
import { generateJson, isAiEnabled } from './gemini.js';
import { EDITOR_SYSTEM } from './prompts.js';

const log = createLogger('enrich');

const BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          headline: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          impact: { type: Type.STRING },
          action: { type: Type.STRING },
          topics: { type: Type.ARRAY, items: { type: Type.STRING } },
          audience: { type: Type.ARRAY, items: { type: Type.STRING } },
          importance: { type: Type.INTEGER },
        },
        required: ['index', 'headline', 'bullets', 'impact', 'action', 'topics', 'audience', 'importance'],
      },
    },
  },
  required: ['items'],
};

/** Everything the ingest pipeline needs, derived without a model. */
export const enrichWithRules = (item) => {
  const body = `${item.title}. ${item.summary ?? ''}`;
  const topics = rules.detectTopics(body, item.hints ?? []);
  const audience = rules.detectAudience(body, item.audienceHints ?? []);

  return {
    headline: rules.tidyHeadline(item.title),
    bullets: rules.summariseExtractive(item.summary || item.title, { maxBullets: 3 }),
    impact: rules.impactFor(topics, item.kind),
    action: rules.actionFor(topics),
    topics,
    audience,
    importance: rules.estimateImportance(body, item.kind),
    readingMinutes: rules.readingMinutes(item.summary),
    model: 'rule-based',
  };
};

const clean = (enrichment, item) => {
  const topics = (enrichment.topics ?? []).filter((topic) => TOPIC_IDS.includes(topic)).slice(0, 3);
  const audience = (enrichment.audience ?? []).filter((entry) => AUDIENCE_IDS.includes(entry)).slice(0, 3);
  const fallback = enrichWithRules(item);

  return {
    headline: (enrichment.headline || fallback.headline).slice(0, 140),
    bullets: (enrichment.bullets ?? []).map((bullet) => String(bullet).trim()).filter(Boolean).slice(0, 4),
    impact: String(enrichment.impact || fallback.impact).slice(0, 400),
    action: String(enrichment.action || fallback.action).slice(0, 200),
    topics: topics.length > 0 ? topics : fallback.topics,
    audience: audience.length > 0 ? audience : fallback.audience,
    importance: Math.min(5, Math.max(1, Number(enrichment.importance) || fallback.importance)),
    readingMinutes: fallback.readingMinutes,
    model: config.ai.fastModel,
  };
};

/**
 * Summarise and classify a batch of feed items in a single Gemini call.
 * Falls back to the rule-based path per item if the model is off or errors.
 *
 * @param {Array<{title: string, summary: string, kind: string, sourceName: string, hints?: string[], audienceHints?: string[]}>} items
 * @returns {Promise<Array<object>>} enrichments aligned with `items` by index
 */
export const enrichBatch = async (items) => {
  if (items.length === 0) return [];
  if (!isAiEnabled()) return items.map(enrichWithRules);

  const prompt = [
    'Produce one briefing object per input item. Return them in the "items" array, each carrying back its "index".',
    '',
    ...items.map((item, index) =>
      [
        `--- ITEM ${index} ---`,
        `type: ${item.kind === 'policy' ? 'official government / regulator publication' : 'news article'}`,
        `source: ${item.sourceName}`,
        `headline: ${item.title}`,
        `extract: ${(item.summary || '(no extract supplied — summarise from the headline only and keep it cautious)').slice(0, 1200)}`,
      ].join('\n'),
    ),
  ].join('\n\n');

  try {
    const result = await generateJson({
      model: config.ai.fastModel,
      system: EDITOR_SYSTEM,
      prompt,
      schema: BATCH_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });

    const byIndex = new Map((result.items ?? []).map((entry) => [Number(entry.index), entry]));
    return items.map((item, index) => {
      const enrichment = byIndex.get(index);
      return enrichment ? clean(enrichment, item) : enrichWithRules(item);
    });
  } catch (error) {
    log.warn(`batch enrichment failed, using rules: ${error.message}`);
    return items.map(enrichWithRules);
  }
};
