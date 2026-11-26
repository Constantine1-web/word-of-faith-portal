import Redis from 'ioredis';

export interface AppRedisClient {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode?: string, durationSec?: number) => Promise<string | null>;
  setex: (key: string, seconds: number, value: string) => Promise<string>;
  del: (...keys: string[]) => Promise<number>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface UpstashRestConfig {
  url: string;
  token: string;
}

/**
 * Resolves Upstash REST credentials from either standard Upstash env vars
 * (`UPSTASH_REDIS_REST_*`) or Vercel Marketplace Upstash KV env vars (`KV_REST_API_*`).
 */
export function resolveUpstashRestConfig(
  env: Record<string, string | undefined> = process.env
): UpstashRestConfig | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/**
 * Stateless HTTP REST client for Upstash Redis.
 * Eliminates per-invocation TCP socket exhaustion across Vercel serverless instances.
 */
export function createUpstashRestClient(
  restUrl: string,
  restToken: string,
  timeoutMs: number = 5000
): AppRedisClient {
  const endpoint = restUrl.replace(/\/+$/, '');

  async function executeCommand<T = unknown>(command: (string | number)[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Upstash REST HTTP ${response.status}: ${text || response.statusText}`);
      }

      const payload = (await response.json()) as { result?: T; error?: string };
      if (payload.error) {
        throw new Error(`Upstash REST error: ${payload.error}`);
      }
      return payload.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: async (key: string) => {
      const res = await executeCommand<string | number | null>(['GET', key]);
      return res === null || res === undefined ? null : String(res);
    },
    set: async (key: string, value: string, mode?: string, durationSec?: number) => {
      const args: (string | number)[] = ['SET', key, String(value)];
      if (mode && typeof durationSec === 'number' && Number.isFinite(durationSec)) {
        args.push(mode.toUpperCase(), Math.max(1, Math.trunc(durationSec)));
      }
      const res = await executeCommand<string | null>(args);
      return res ?? 'OK';
    },
    setex: async (key: string, seconds: number, value: string) => {
      const res = await executeCommand<string>([
        'SETEX',
        key,
        Math.max(1, Math.trunc(seconds)),
        String(value),
      ]);
      return res || 'OK';
    },
    del: async (...keys: string[]) => {
      if (keys.length === 0) return 0;
      const res = await executeCommand<number>(['DEL', ...keys]);
      return Number(res) || 0;
    },
    incr: async (key: string) => {
      const res = await executeCommand<number>(['INCR', key]);
      return Number(res);
    },
    expire: async (key: string, seconds: number) => {
      const res = await executeCommand<number>([
        'EXPIRE',
        key,
        Math.max(1, Math.trunc(seconds)),
      ]);
      return Number(res) || 0;
    },
    ttl: async (key: string) => {
      const res = await executeCommand<number>(['TTL', key]);
      return Number(res);
    },
    on: () => {},
  };
}

const globalForRedis = global as unknown as {
  redisTcp?: Redis;
};

/**
 * Lazy TCP ioredis client preserved for BullMQ background workers (`src/worker.ts`)
 * and environments configured solely with `REDIS_URL`.
 */
export function getTcpRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  if (globalForRedis.redisTcp) {
    return globalForRedis.redisTcp;
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
  });

  client.on('error', (err) => {
    // Suppress unhandled redis connection noise when unavailable
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Redis] Connection warning:', err.message);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForRedis.redisTcp = client;
  }

  return client;
}

const restConfig = resolveUpstashRestConfig();
const upstashRestClient = restConfig
  ? createUpstashRestClient(restConfig.url, restConfig.token)
  : null;

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
};

export const redis: AppRedisClient =
  upstashRestClient ||
  (getTcpRedisClient() as unknown as AppRedisClient | null) ||
  redisMock;
export default redis;

