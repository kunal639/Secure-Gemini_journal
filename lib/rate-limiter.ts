/**
 * In-Memory Sliding Window Rate Limiter
 * 
 * Provides:
 * 1. Pre-auth rate limiting by Client IP (protects expensive crypto/JWKS lookups)
 * 2. Post-auth rate limiting by Authenticated UID (protects AI model quota & Firestore ops)
 * 
 * ARCHITECTURE LIMITATION & COMPLIANCE NOTE (SEC-08):
 * - Scope: Process-Local / Container-Local Memory.
 * - In Cloud Run or multi-instance container environments, this in-memory Map operates
 *   within the boundary of each individual container instance. If multiple Cloud Run
 *   container revisions or replicas autoscale, rate limits are enforced on a per-instance basis.
 * - Production Hardening Recommendation: For distributed, horizontally scaled deployments
 *   across multiple Cloud Run instances, state should be backed by a centralized, low-latency
 *   store (such as Google Cloud Memorystore / Redis) or enforced at the edge/load-balancer
 *   ingress layer (e.g. Google Cloud Armor rate limiting policies).
 */

interface RateLimitRecord {
  timestamps: number[];
}

const windowMs = 60 * 1000; // 1 minute
const maxUserRequestsPerWindow = 20; // max 20 requests per minute per authenticated UID
const maxPreAuthRequestsPerWindow = 60; // max 60 pre-auth checks per minute per IP

const userStorage = new Map<string, RateLimitRecord>();
const ipStorage = new Map<string, RateLimitRecord>();

// Periodic cleanup of stale records every 5 minutes
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of userStorage.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
      if (record.timestamps.length === 0) {
        userStorage.delete(key);
      }
    }
    for (const [key, record] of ipStorage.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
      if (record.timestamps.length === 0) {
        ipStorage.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

function evaluateWindow(
  storage: Map<string, RateLimitRecord>,
  identifier: string,
  limit: number
): RateLimitResult {
  const now = Date.now();
  let record = storage.get(identifier);

  if (!record) {
    record = { timestamps: [] };
    storage.set(identifier, record);
  }

  // Remove timestamps outside sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldestTimestamp = record.timestamps[0];
    const resetInSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
    };
  }

  record.timestamps.push(now);

  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    resetInSeconds: Math.ceil(windowMs / 1000),
  };
}

/**
 * Pre-auth rate limit: checks client IP before cryptographic JWT verification.
 */
export function checkPreAuthRateLimit(clientIp: string): RateLimitResult {
  return evaluateWindow(ipStorage, clientIp || 'unknown_ip', maxPreAuthRequestsPerWindow);
}

/**
 * Post-auth rate limit: checks authenticated UID.
 */
export function checkRateLimit(uid: string): RateLimitResult {
  return evaluateWindow(userStorage, uid, maxUserRequestsPerWindow);
}
