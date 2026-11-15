/**
 * Rate limiter for edge functions.
 * Uses in-memory as primary (fast, zero latency) with DB-backed persistence
 * for critical endpoints so limits survive cold starts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

const requestCounts = new Map<string, { count: number; windowStart: number }>();

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  /** If true, also persist to DB so limits survive cold starts */
  persistent?: boolean;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  persistent: false,
};

export function checkRateLimit(
  identifier: string,
  options: Partial<RateLimitOptions> = {}
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = Date.now();
  const entry = requestCounts.get(identifier);

  if (requestCounts.size > 10000) {
    for (const [key, val] of requestCounts.entries()) {
      if (now - val.windowStart > opts.windowMs) {
        requestCounts.delete(key);
      }
    }
  }

  if (!entry || now - entry.windowStart > opts.windowMs) {
    requestCounts.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: opts.maxRequests - 1 };
  }

  entry.count++;

  if (entry.count > opts.maxRequests) {
    const retryAfterMs = opts.windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return { allowed: true, remaining: opts.maxRequests - entry.count };
}

/**
 * DB-persistent rate limit check. Uses the rate_limit_log table via
 * SECURITY DEFINER function so it survives cold starts.
 * Falls back to in-memory if DB call fails (never blocks legitimate requests).
 */
export async function checkRateLimitPersistent(
  identifier: string,
  options: Partial<RateLimitOptions> = {}
): Promise<{ allowed: boolean; remaining: number; retryAfterMs?: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return checkRateLimit(identifier, opts);
  }

  try {
    const db = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await db.rpc('check_and_increment_rate_limit', {
      p_key: identifier,
      p_window_ms: opts.windowMs,
      p_max_requests: opts.maxRequests,
    });

    if (error || !data) {
      // Fail open — fall back to in-memory so a DB hiccup never blocks users
      return checkRateLimit(identifier, opts);
    }

    return {
      allowed: data.allowed,
      remaining: data.remaining ?? 0,
      retryAfterMs: data.retry_after_ms ?? undefined,
    };
  } catch (err) {
    return checkRateLimit(identifier, opts);
  }
}

export function rateLimitResponse(corsHeaders: Record<string, string>, retryAfterMs?: number) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        ...(retryAfterMs ? { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } : {}),
      },
    }
  );
}

export function getClientIdentifier(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
