import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

const globalForRedis = global as unknown as { redis?: Redis };

let redisInstance: Redis | null = null;

if (redisUrl) {
  redisInstance =
    globalForRedis.redis ||
    new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
    });

  redisInstance.on('error', (err) => {
    // Suppress unhandled redis connection noise when unavailable
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Redis] Connection warning:', err.message);
    }
  });

  if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redisInstance;
}

// Stateful in-memory fallback store with TTL enforcement when Redis is not configured
const memoryStore = new Map<string, { value: string; expiresAt: number | null }>();

function getValidEntry(key: string): { value: string; expiresAt: number | null } | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
}

const redisMock = {
  get: async (key: string) => {
    const entry = getValidEntry(key);
    return entry ? entry.value : null;
  },
  set: async (key: string, value: string, mode?: string, durationSec?: number) => {
    const expiresAt =
      mode?.toUpperCase() === 'EX' && typeof durationSec === 'number'
        ? Date.now() + durationSec * 1000
        : null;
    memoryStore.set(key, { value: String(value), expiresAt });
    return 'OK';
  },
  setex: async (key: string, seconds: number, value: string) => {
    memoryStore.set(key, {
      value: String(value),
      expiresAt: Date.now() + seconds * 1000,
    });
    return 'OK';
  },
  del: async (...keys: string[]) => {
    let deleted = 0;
    for (const k of keys) {
      if (memoryStore.delete(k)) deleted++;
    }
    return deleted;
  },
  incr: async (key: string) => {
    const entry = getValidEntry(key);
    const current = entry ? parseInt(entry.value, 10) || 0 : 0;
    const next = current + 1;
    memoryStore.set(key, {
      value: String(next),
      expiresAt: entry ? entry.expiresAt : null,
    });
    return next;
  },
  expire: async (key: string, seconds: number) => {
    const entry = getValidEntry(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    memoryStore.set(key, entry);
    return 1;
  },
  ttl: async (key: string) => {
    const entry = getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  },
  on: () => {},
} as unknown as Redis;

export const redis = redisInstance || redisMock;
export default redis;

