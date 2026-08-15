import { GoogleGenAI } from '@google/genai';

import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('gemini');

let client = null;

const getClient = () => {
  if (!config.ai.enabled) return null;
  client ??= new GoogleGenAI({ apiKey: config.ai.apiKey });
  return client;
};

export const isAiEnabled = () => config.ai.enabled;

export class AiUnavailableError extends Error {
  constructor(message = 'Gemini is not configured') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

const stripCodeFence = (text) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

/**
 * Free-form text generation.
 * @param {object} options
 * @param {string} [options.model]
 * @param {string} options.prompt
 * @param {string} [options.system]
 * @param {Array<{role: 'user'|'model', text: string}>} [options.history]
 * @param {number} [options.temperature]
 */
export const generateText = async ({
  model = config.ai.fastModel,
  prompt,
  system,
  history = [],
  temperature = 0.7,
  maxOutputTokens = 2048,
}) => {
  const ai = getClient();
  if (!ai) throw new AiUnavailableError();

  const contents = [
    ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      ...(system ? { systemInstruction: system } : {}),
      temperature,
      maxOutputTokens,
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
};

/**
 * Structured generation. `schema` is a Gemini responseSchema object.
 * Retries once on a parse failure before giving up.
 */
export const generateJson = async ({
  model = config.ai.fastModel,
  prompt,
  system,
  schema,
  temperature = 0.3,
  maxOutputTokens = 2048,
}) => {
  const ai = getClient();
  if (!ai) throw new AiUnavailableError();

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          ...(system ? { systemInstruction: system } : {}),
          responseMimeType: 'application/json',
          ...(schema ? { responseSchema: schema } : {}),
          temperature,
          maxOutputTokens,
        },
      });

      const text = response.text;
      if (!text) throw new Error('empty response');
      return JSON.parse(stripCodeFence(text));
    } catch (error) {
      lastError = error;
      log.warn(`generateJson attempt ${attempt + 1} failed: ${error.message}`);
    }
  }

  throw lastError ?? new Error('generateJson failed');
};
