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
    // Twilio's opt-out handling sends the confirmation; a reply from us would be blocked.
    expect(result.reply).toBeUndefined();

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

  it.each(['START', 'unstop'])('stays silent on %s and leaves groups alone', async (keyword) => {
    await seedGroup();
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'STOP');

    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, keyword);
    expect(result.action).toBe('start');
    // Twilio's opt-out handling sends the START reply; ours would be a duplicate.
    expect(result.reply).toBeUndefined();

    // Opting back in to Twilio doesn't rejoin any group.
    const member = await database.collections.members.findOne({ phoneNumber: PHONE });
    const sub = await database.collections.subscriptions.findOne({ memberId: member!._id });
    expect(sub?.status).toBe('unsubscribed');
  });

  it('returns help text on HELP', async () => {
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'HELP');
    expect(result.action).toBe('help');
    expect(result.reply).toContain(ORG);
  });

  it('includes the support contact in the HELP reply when configured', async () => {
    const result = await processInbound(
      { collections: database.collections, orgName: ORG, supportEmail: 'help@example.org' },
      PHONE,
      'HELP',
    );
    expect(result.reply).toContain('Contact help@example.org.');
  });

  it('lists the active keywords when someone in no group texts something else', async () => {
    await seedGroup();
    await seedGroup({ name: 'Tigers', keyword: 'TIGER' });
    await seedGroup({ name: 'Old', keyword: 'OLD', active: false });
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGN');
    expect(result.action).toBe('unknown');
    expect(result.reply).toBe(
      'Test Org: Keyword not recognized. Text one of these to join: DRAGON, TIGER. Reply HELP for help or STOP to opt out.',
    );
  });

  it('says there is nothing to join when there are no active groups', async () => {
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'NOPE');
    expect(result.action).toBe('unknown');
    expect(result.reply).toContain('There are no groups to join right now.');
  });

  it("tells a member their texts aren't read", async () => {
    await seedGroup();
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'See you Saturday!');
    expect(result.action).toBe('unknown');
    expect(result.reply).toBe(
      "Test Org: Texts to this number aren't actively read. Reply HELP for help or STOP to opt out.",
    );
  });

  it('treats someone who left every group as not a member', async () => {
    await seedGroup();
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'DRAGON');
    await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'STOP');
    const result = await processInbound({ collections: database.collections, orgName: ORG }, PHONE, 'Hello?');
    expect(result.reply).toContain('Keyword not recognized.');
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
