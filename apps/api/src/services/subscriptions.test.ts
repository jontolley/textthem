import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { connectDatabase, type Database } from '../db/index.js';
import { processInbound } from './subscriptions.js';
import type { GroupDoc } from '../db/documents.js';

let mongod: MongoMemoryServer;
let database: Database;

const ORG = 'Test Org';
const PHONE = '+15551230001';

async function seedGroup(overrides: Partial<GroupDoc> = {}): Promise<GroupDoc> {
  const now = new Date();
  const doc: GroupDoc = {
    _id: new ObjectId(),
    name: 'Dragons',
    keyword: 'DRAGON',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await database.collections.groups.insertOne(doc);
  return doc;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
});

afterAll(async () => {
  await database.client.close();
  await mongod.stop();
});

beforeEach(async () => {
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
  ]);
});

describe('processInbound', () => {
  it('subscribes a member when texting a group keyword', async () => {
    await seedGroup();
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'dragon');

    expect(result.action).toBe('join');
    expect(result.matchedKeyword).toBe('DRAGON');
    expect(result.reply).toContain('Dragons');

    const member = await database.collections.members.findOne({ phoneNumber: PHONE });
    expect(member).not.toBeNull();
    const sub = await database.collections.subscriptions.findOne({ memberId: member!._id });
    expect(sub?.status).toBe('subscribed');
    expect(sub?.source).toBe('sms');
  });

  it('is case- and whitespace-insensitive', async () => {
    await seedGroup();
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, '  DrAgOn  ');
    expect(result.action).toBe('join');
  });

  it('unsubscribes from all groups on STOP', async () => {
    const g1 = await seedGroup();
    const g2 = await seedGroup({ _id: new ObjectId(), keyword: 'WOLF', name: 'Wolves' });
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'WOLF');

    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'STOP');
    expect(result.action).toBe('stop');

    const subs = await database.collections.subscriptions.find({}).toArray();
    expect(subs).toHaveLength(2);
    expect(subs.every((s) => s.status === 'unsubscribed')).toBe(true);
    expect([g1._id, g2._id]).toHaveLength(2); // both groups existed
  });

  it('resubscribes after STOP when texting the keyword again', async () => {
    await seedGroup();
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'STOP');
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');

    const member = await database.collections.members.findOne({ phoneNumber: PHONE });
    const sub = await database.collections.subscriptions.findOne({ memberId: member!._id });
    expect(sub?.status).toBe('subscribed');
    expect(sub?.unsubscribedAt).toBeUndefined();
  });

  it('returns help text on HELP', async () => {
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'HELP');
    expect(result.action).toBe('help');
    expect(result.reply).toContain(ORG);
  });

  it('returns unknown for unrecognized keyword', async () => {
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'NOPE');
    expect(result.action).toBe('unknown');
  });

  it('does not subscribe to an inactive group', async () => {
    await seedGroup({ active: false });
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    expect(result.action).toBe('unknown');
  });

  it('does not create a duplicate subscription on repeat joins', async () => {
    await seedGroup();
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    const count = await database.collections.subscriptions.countDocuments({});
    expect(count).toBe(1);
  });
});
