import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);

try {
  const result = db.raw.prepare('DELETE FROM events').run();
  console.log(`Deleted ${result.changes} notification event records`);
} finally {
  db.close();
}
