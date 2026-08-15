/**
 * Mirrors `server/src/constants.js`. The API also serves this at
 * `/api/taxonomy` — this copy exists so labels render instantly on first paint
 * and while offline. Keep the ids identical to the server's.
 */

export const TOPICS = [
  { id: 'jobs-market', label: 'Jobs market', emoji: '📈' },
  { id: 'pay-rights', label: 'Pay & employment rights', emoji: '⚖️' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'skills-training', label: 'Skills & training', emoji: '🛠️' },
  { id: 'apprenticeships', label: 'Apprenticeships', emoji: '🧰' },
  { id: 'graduates', label: 'Graduates & early careers', emoji: '🧑‍🎓' },
  { id: 'benefits-welfare', label: 'Benefits & welfare', emoji: '🏦' },
  { id: 'immigration-visas', label: 'Immigration & work visas', emoji: '🛂' },
  { id: 'economy', label: 'Economy', emoji: '💷' },
  { id: 'public-sector', label: 'Public sector & NHS', emoji: '🏥' },
  { id: 'technology', label: 'Technology & AI', emoji: '💻' },
  { id: 'business', label: 'Business & enterprise', emoji: '🏢' },
] as const;

export const AUDIENCES = [
  { id: 'jobseekers', label: 'Job seekers' },
  { id: 'students', label: 'Students' },
  { id: 'graduates', label: 'Graduates' },
  { id: 'apprentices', label: 'Apprentices' },
  { id: 'career-changers', label: 'Career changers' },
  { id: 'employees', label: 'Employees' },
  { id: 'employers', label: 'Employers' },
  { id: 'parents', label: 'Parents & carers' },
  { id: 'migrants', label: 'Migrants & visa holders' },
] as const;

export const EXPERIENCE_LEVELS = [
  { id: 'student', label: 'Student / in education' },
  { id: 'entry', label: 'Entry level (0-2 years)' },
  { id: 'mid', label: 'Mid level (3-7 years)' },
  { id: 'senior', label: 'Senior (8+ years)' },
  { id: 'lead', label: 'Lead / management' },
  { id: 'returner', label: 'Returning to work' },
] as const;

export const UK_REGIONS = [
  'UK wide',
  'London',
  'South East',
  'South West',
  'East of England',
  'East Midlands',
  'West Midlands',
  'Yorkshire and the Humber',
  'North East',
  'North West',
  'Scotland',
  'Wales',
  'Northern Ireland',
  'Remote',
] as const;

const TOPIC_LOOKUP = new Map(TOPICS.map((topic) => [topic.id as string, topic]));
const AUDIENCE_LOOKUP = new Map(AUDIENCES.map((audience) => [audience.id as string, audience]));

export const topicLabel = (id: string): string => TOPIC_LOOKUP.get(id)?.label ?? id;
export const topicEmoji = (id: string): string => TOPIC_LOOKUP.get(id)?.emoji ?? '•';
export const audienceLabel = (id: string): string => AUDIENCE_LOOKUP.get(id)?.label ?? id;
