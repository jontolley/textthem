/**
 * Validates a MongoDB connection by pinging the server.
 * Run: node --env-file=apps/api/.env.production.local --import tsx apps/api/scripts/check-mongo.ts
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB_NAME ?? 'textthem';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  // listCollections requires read access to the target DB, so this confirms the
  // (now scoped-down) user can actually use the text_them database.
  await client.db(dbName).listCollections().toArray();
  console.log(`✅ Connected and authorized on "${dbName}" database.`);
} catch (err) {
  console.error(`❌ Connection/authorization failed: ${(err as Error).message}`);
  process.exit(1);
} finally {
  await client.close();
}
