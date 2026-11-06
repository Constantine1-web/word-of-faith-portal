import redis from './redis';

const fallbackBuckets = new Map<string, { count: number; expiresAt: number }>();

/**
 * A standard Redis token bucket rate limiter with in-memory fallback.
 * @param identifier The unique key (e.g., IP address or email)
 * @param limit Maximum allowed requests within the window
 * @param windowInSeconds The time window in seconds
 */
export async function rateLimit(
  identifier: string,
  limit: number = 5,
  windowInSeconds: number = 60
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const key = `ratelimit:${identifier}`;
  try {
    const currentCount = await redis.incr(key);

    if (currentCount === 1) {
      await redis.expire(key, windowInSeconds);
    }

    const ttl = await redis.ttl(key);
    const effectiveTtl = ttl > 0 ? ttl : windowInSeconds;

    return {
      success: currentCount <= limit,
      limit,
      remaining: Math.max(0, limit - currentCount),
      reset: Date.now() + effectiveTtl * 1000,
    };
  } catch (error) {
    const now = Date.now();
    const existing = fallbackBuckets.get(key);
    if (!existing || now >= existing.expiresAt) {
      const expiresAt = now + windowInSeconds * 1000;
      fallbackBuckets.set(key, { count: 1, expiresAt });
      return {
        success: 1 <= limit,
        limit,
        remaining: Math.max(0, limit - 1),
        reset: expiresAt,
      };
    }
    existing.count += 1;
    fallbackBuckets.set(key, existing);
    return {
      success: existing.count <= limit,
      limit,
      remaining: Math.max(0, limit - existing.count),
      reset: existing.expiresAt,
    };
  }
}

