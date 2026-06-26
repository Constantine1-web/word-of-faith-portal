import redis from './redis';

/**
 * A standard Redis token bucket rate limiter.
 * @param identifier The unique key (e.g., IP address or email)
 * @param limit Maximum allowed requests within the window
 * @param windowInSeconds The time window in seconds
 */
export async function rateLimit(
  identifier: string,
  limit: number = 5,
  windowInSeconds: number = 60
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  try {
    const key = `ratelimit:${identifier}`;
    const currentCount = await redis.incr(key);

    if (currentCount === 1) {
      await redis.expire(key, windowInSeconds);
    }

    const ttl = await redis.ttl(key);

    return {
      success: currentCount <= limit,
      limit,
      remaining: Math.max(0, limit - currentCount),
      reset: Date.now() + (ttl * 1000)
    };
  } catch (error) {
    console.error("Rate limit error (falling back to success):", error);
    // Fail open so users aren't locked out if Redis goes down
    return { success: true, limit, remaining: 1, reset: 0 };
  }
}
