const { MongoClient } = require('mongodb');

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const CLIENT_KEY = '__playClassicsMongoClientPromise';
const INDEX_KEY = '__playClassicsMongoIndexesPromise';

function config() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MongoDB is not connected. Add MONGODB_URI to the Vercel environment variables.');
  }

  const database = process.env.PLAY_CLASSICS_DB_NAME || 'play_classics';
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(database)) {
    throw new Error('PLAY_CLASSICS_DB_NAME must be a valid MongoDB database name.');
  }

  return { uri, database };
}

async function getCollection() {
  const { uri, database } = config();
  if (!globalThis[CLIENT_KEY]) {
    const client = new MongoClient(uri, {
      appName: 'play-classics-inc',
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
    globalThis[CLIENT_KEY] = client.connect().catch((error) => {
      globalThis[CLIENT_KEY] = null;
      throw error;
    });
  }

  const client = await globalThis[CLIENT_KEY];
  const collection = client.db(database).collection('rooms');

  if (!globalThis[INDEX_KEY]) {
    globalThis[INDEX_KEY] = Promise.all([
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'room_expiry' }),
      collection.createIndex({ status: 1, updatedAt: -1 }, { name: 'room_status_updated' }),
    ]).catch((error) => {
      globalThis[INDEX_KEY] = null;
      throw error;
    });
  }
  await globalThis[INDEX_KEY];
  return collection;
}

function toDocument(room) {
  return {
    ...room,
    _id: room.id,
    expiresAt: new Date(Date.now() + ROOM_TTL_MS),
  };
}

function fromDocument(document) {
  if (!document) return null;
  const { _id, expiresAt, ...room } = document;
  return room;
}

async function readRoom(id) {
  const collection = await getCollection();
  const document = await collection.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  return fromDocument(document);
}

async function createRoom(room) {
  const collection = await getCollection();
  try {
    await collection.insertOne(toDocument(room));
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function compareAndSet(id, revision, room) {
  const collection = await getCollection();
  const replacement = toDocument(room);
  const result = await collection.replaceOne(
    { _id: id, revision, expiresAt: { $gt: new Date() } },
    replacement,
  );
  if (result.matchedCount === 1) return 'OK';
  const exists = await collection.findOne({ _id: id, expiresAt: { $gt: new Date() } }, { projection: { _id: 1 } });
  return exists ? 'CONFLICT' : 'NOT_FOUND';
}

async function joinRoom(id, user) {
  const collection = await getCollection();
  const current = await readRoom(id);
  if (!current) return { error: 'Room not found. It may have expired.' };
  if (current.status === 'finished') return { error: 'This room has already finished.' };
  if (current.players.some((player) => player.id === user.id)) return current;
  if (current.players[1]) return { error: 'This room already has two players.' };

  const document = await collection.findOneAndUpdate(
    {
      _id: id,
      status: { $ne: 'finished' },
      'players.1': { $exists: false },
      'players.0.id': { $ne: user.id },
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        'players.1': user,
        status: 'active',
        updatedAt: Date.now(),
        expiresAt: new Date(Date.now() + ROOM_TTL_MS),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: 'after', projection: { expiresAt: 0 } },
  );

  if (document) return fromDocument(document);

  const latest = await readRoom(id);
  if (!latest) return { error: 'Room not found. It may have expired.' };
  if (latest.players.some((player) => player.id === user.id)) return latest;
  if (latest.status === 'finished') return { error: 'This room has already finished.' };
  return { error: 'This room already has two players.' };
}

async function pingMongo() {
  await getCollection();
  const { database } = config();
  const client = await globalThis[CLIENT_KEY];
  await client.db(database).command({ ping: 1 });
  return true;
}

module.exports = { getCollection, readRoom, createRoom, compareAndSet, joinRoom, pingMongo };
