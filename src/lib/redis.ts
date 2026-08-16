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

// Fallback mock object if Redis is not configured
const redisMock = {
  get: async () => null,
  set: async () => 'OK',
  setex: async () => 'OK',
  del: async () => 0,
  incr: async () => 1,
  expire: async () => 1,
  ttl: async () => -1,
  on: () => {},
} as unknown as Redis;

export const redis = redisInstance || redisMock;
export default redis;
