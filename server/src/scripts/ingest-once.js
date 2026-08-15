import { runIngest } from '../ingest.js';

const stats = await runIngest();
console.log(JSON.stringify(stats, null, 2));
process.exit(0);
