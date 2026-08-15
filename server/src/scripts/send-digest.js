import { runDigest } from '../notifications/digest.js';

const force = process.argv.includes('--force');
const summary = await runDigest({ force });
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
