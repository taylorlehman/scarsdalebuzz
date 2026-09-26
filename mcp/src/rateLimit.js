/**
 * Fixed-window rate limiter kept in instance memory. Cloud Functions may run
 * several instances, so the effective limit is `max × instances` (bounded by
 * the function's maxInstances). That is enough to blunt abuse of a small
 * read-only directory without adding a shared store to every request.
 *
 * @param {object} options
 * @param {number} options.windowMs
 * @param {number} options.max
 * @param {(req: import('express').Request) => string | undefined} options.key
 */
export function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  const MAX_KEYS = 10_000;

  return (req, res, next) => {
    const id = key(req) || 'unknown';
    const now = Date.now();
    let entry = hits.get(id);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= MAX_KEYS) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value);
      }
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(id, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'rate_limited', error_description: 'Too many requests. Please slow down.' });
    }
    return next();
  };
}
