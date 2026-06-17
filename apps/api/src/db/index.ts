import { MongoClient, type Collection, type Db } from 'mongodb';
import fp from 'fastify-plugin';
import {
  COLLECTIONS,
  type GroupDoc,
  type MemberDoc,
  type SubscriptionDoc,
  type MessageDoc,
  type InboundMessageDoc,
} from './documents.js';

export interface Collections {
  groups: Collection<GroupDoc>;
  members: Collection<MemberDoc>;
  subscriptions: Collection<SubscriptionDoc>;
  messages: Collection<MessageDoc>;
  inboundMessages: Collection<InboundMessageDoc>;
}

export interface Database {
  client: MongoClient;
  db: Db;
  collections: Collections;
}

function getCollections(db: Db): Collections {
  return {
    groups: db.collection<GroupDoc>(COLLECTIONS.groups),
    members: db.collection<MemberDoc>(COLLECTIONS.members),
    subscriptions: db.collection<SubscriptionDoc>(COLLECTIONS.subscriptions),
    messages: db.collection<MessageDoc>(COLLECTIONS.messages),
    inboundMessages: db.collection<InboundMessageDoc>(COLLECTIONS.inboundMessages),
  };
}

/** Creates the indexes the app relies on. Safe to run repeatedly. */
export async function ensureIndexes(collections: Collections): Promise<void> {
  await collections.groups.createIndex({ keyword: 1 }, { unique: true });
  await collections.members.createIndex({ phoneNumber: 1 }, { unique: true });
  await collections.subscriptions.createIndex(
    { memberId: 1, groupId: 1 },
    { unique: true },
  );
  await collections.subscriptions.createIndex({ groupId: 1, status: 1 });
  await collections.messages.createIndex({ groupId: 1, sentAt: -1 });
  await collections.inboundMessages.createIndex({ receivedAt: -1 });
}

export async function connectDatabase(uri: string, dbName: string): Promise<Database> {
  // Bound server selection so a blocked/unreachable cluster fails with a clear
  // error instead of hanging the whole boot sequence.
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  const db = client.db(dbName);
  const collections = getCollections(db);
  await ensureIndexes(collections);
  return { client, db, collections };
}

declare module 'fastify' {
  interface FastifyInstance {
    mongo: Database;
  }
}

/**
 * Fastify plugin that connects to Mongo and decorates the instance with `mongo`.
 * Accepts an existing Database (used in tests) or connection params.
 */
export const databasePlugin = fp<{ uri: string; dbName: string } | { database: Database }>(
  async (fastify, opts) => {
    const database =
      'database' in opts ? opts.database : await connectDatabase(opts.uri, opts.dbName);
    fastify.decorate('mongo', database);
    fastify.addHook('onClose', async () => {
      // Don't close a database that was injected from the outside (tests own it).
      if (!('database' in opts)) {
        await database.client.close();
      }
    });
  },
  { name: 'database' },
);
