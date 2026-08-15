/**
 * Shared taxonomy. The app mirrors these ids in `apps/mobile/src/lib/types.ts`
 * — keep the two lists in sync when you add a topic.
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
];

export const TOPIC_IDS = TOPICS.map((topic) => topic.id);

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
];

export const AUDIENCE_IDS = AUDIENCES.map((audience) => audience.id);

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
];

export const EXPERIENCE_LEVELS = [
  { id: 'student', label: 'Student / in education' },
  { id: 'entry', label: 'Entry level (0-2 years)' },
  { id: 'mid', label: 'Mid level (3-7 years)' },
  { id: 'senior', label: 'Senior (8+ years)' },
  { id: 'lead', label: 'Lead / management' },
  { id: 'returner', label: 'Returning to work' },
];
