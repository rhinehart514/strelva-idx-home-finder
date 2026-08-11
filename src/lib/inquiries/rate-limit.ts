type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterSeconds: number; resetAt: number };

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly limit = 5,
    private readonly windowMs = 10 * 60 * 1_000,
  ) {}

  consume(key: string, now = Date.now()): RateLimitResult {
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.entries.set(key, { count: 1, resetAt });
      this.prune(now);
      return { allowed: true, remaining: this.limit - 1, resetAt };
    }

    if (current.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
        resetAt: current.resetAt,
      };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: this.limit - current.count,
      resetAt: current.resetAt,
    };
  }

  private prune(now: number): void {
    if (this.entries.size < 1_000) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

const globalRateLimiter = globalThis as typeof globalThis & {
  __strelvaInquiryRateLimiter?: InMemoryRateLimiter;
};

export const inquiryRateLimiter =
  globalRateLimiter.__strelvaInquiryRateLimiter ?? new InMemoryRateLimiter();

if (process.env.NODE_ENV !== "production") {
  globalRateLimiter.__strelvaInquiryRateLimiter = inquiryRateLimiter;
}

export function getInquiryClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip")?.trim() || forwarded || "unknown-client";
}
