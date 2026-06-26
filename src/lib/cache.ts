import { redis } from './redis';

/**
 * Attempts to retrieve and parse cached data from Redis.
 * Fails gracefully by returning null if Redis is unavailable.
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`[Cache] Error reading key ${key}:`, error);
    return null; // Graceful degradation: treat as cache miss
  }
}

/**
 * Serializes and saves data to Redis with a TTL.
 * Fails gracefully if Redis is unavailable.
 */
export async function setCachedData(key: string, data: any, ttlInSeconds: number = 86400): Promise<void> {
  try {
    const serializedData = JSON.stringify(data);
    await redis.setex(key, ttlInSeconds, serializedData);
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
    // Graceful degradation: fail silently so the app doesn't crash
  }
}

/**
 * Removes a specific key from Redis to invalidate the cache.
 * Fails gracefully if Redis is unavailable.
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`[Cache] Error invalidating key ${key}:`, error);
  }
}
