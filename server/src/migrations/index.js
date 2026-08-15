import initial from './001-initial.js';
import auth from './002-auth.js';
import sources from './003-sources.js';
import contentFields from './004-content-fields.js';
import scrapeLogs from './005-scrape-logs.js';
import seedSources from './006-seed-sources.js';

/** Ordered by id — add new migrations to the end, never renumber. */
export const migrations = [initial, auth, sources, contentFields, scrapeLogs, seedSources];
