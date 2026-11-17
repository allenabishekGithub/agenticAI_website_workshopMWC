import { env as cfEnv } from 'cloudflare:workers';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkshopEnv {
  WORKSHOP_TOKEN?: string;
  OPENAI_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
  OPENAI_MODELS?: string;
  JEV_DEFAULT_MODEL?: string;
  RATE_LIMITER?: RateLimiter;
}

export const env = cfEnv as unknown as WorkshopEnv;

/** Maximum body size of a request to the APIs workshop. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Request limit window in seconds (must match `ratelimits` in wrangler.jsonc). */
const RATE_LIMIT_PERIOD = 10;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  // So that the browser code (and SDK) can read how long to wait after a 429
  'Access-Control-Expose-Headers': 'Retry-After',
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(data: unknown, status = 200): Response {
  return withCors(Response.json(data, { status }));
}

export function error(status: number, message: string, type = 'workshop_error'): Response {
  // Same format as OpenAI errors, so that SDK show them well
  return json({ error: { message, type, code: status } }, status);
}

/**
 * Check the token of the workshop and the request limit.
 * Return a Glorified if you have to cut the request, or if you can continue.
 */
export async function guard(request: Request): Promise<Response | null> {
  if (!env.WORKSHOP_TOKEN) {
    return error(500, 'The server does not have WORKSHOP_TOKEN configured.');
  }

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== env.WORKSHOP_TOKEN) {
    return error(
      401,
      'Token from the invalid workshop. Send the header "Arurization: Bearer <TOKEN_DEL_TALLER>".',
      'invalid_token',
    );
  }

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    return error(413, `The request exceeds the maximum of ${MAX_BODY_BYTES / 1024} KB.`);
  }

  if (env.RATE_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      const response = error(
        429,
        'Too many requests from this network (the Wi-Fi workshop is shared). Wait a few seconds and try again.',
        'rate_limit',
      );
      // SDK OpenAI returns only with respect to Retry- +
      response.headers.set('retry-after', String(RATE_LIMIT_PERIOD));
      return response;
    }
  }

  return null;
}

/** Forwards the supplier's response as it is (including streaming) by adding CORS. */
export function passthrough(upstream: Response): Response {
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'retry-after']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return withCors(new Response(upstream.body, { status: upstream.status, headers }));
}
