/**
 * Lightweight, memory-efficient in-memory sliding-window rate limiter
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000, // 15 minutes
  max = 20, // max 20 requests per window
  message = "Too many requests from this IP, please try again later."
} = {}) {
  const requests = new Map();

  // Periodic cleanup every 5 minutes to prevent memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter((time) => now - time < windowMs);
      if (validTimestamps.length === 0) {
        requests.delete(key);
      } else {
        requests.set(key, validTimestamps);
      }
    }
  }, 5 * 60 * 1000);

  // Unref interval so it doesn't prevent Node process from exiting
  if (cleanupInterval.unref) cleanupInterval.unref();

  return function rateLimiter(req, res, next) {
    const ip = req.headers["x-forwarded-for"]
      ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
      : req.socket.remoteAddress || req.ip || "unknown";

    const now = Date.now();
    const timestamps = requests.get(ip) || [];
    const recent = timestamps.filter((time) => now - time < windowMs);

    if (recent.length >= max) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({
        message,
        retryAfterSeconds
      });
    }

    recent.push(now);
    requests.set(ip, recent);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - recent.length));

    next();
  };
}

module.exports = { createRateLimiter };
