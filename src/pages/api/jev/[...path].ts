import type { APIRoute } from 'astro';
import { env, error, guard, passthrough, preflight } from '../../../lib/proxy';

export const prerender = false;

const UPSTREAM = 'https://api.typesafe.ai';

// Supported routes → API actual route of TypeSafe.
// `/api/jev` is a shortcut of `/api/jev/v1/systemone`.
const ROUTES: Record<string, { method: 'GET' | 'POST'; path: string }> = {
  '': { method: 'POST', path: '/v1/systemone' },
  'v1/systemone': { method: 'POST', path: '/v1/systemone' },
  'v1/models': { method: 'GET', path: '/v1/models' },
};

export const OPTIONS: APIRoute = () => preflight();

export const ALL: APIRoute = async ({ request, params }) => {
  const route = ROUTES[params.path ?? ''];
  if (!route) return error(404, 'Route not available. Use Post /api/jev or Get /api/jev/v1/models.');
  if (request.method !== route.method) return error(405, `This route only supports ${route.method}.`);

  const blocked = await guard(request);
  if (blocked) return blocked;

  if (!env.TYPESAFE_API_KEY) return error(500, 'The server does not have TYPESAFE_API_KEY configured.');

  const headers = new Headers({ authorization: `Bearer ${env.TYPESAFE_API_KEY}` });
  let body: BodyInit | undefined;

  if (route.method === 'POST') {
    const encoding = request.headers.get('content-encoding');

    if (encoding) {
      // The official SDK compresses the body (zstd/gzip): it is forwarded without touching.
      headers.set('content-encoding', encoding);
      headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
      body = await request.arrayBuffer();
    } else {
      let payload: Record<string, unknown>;
      try {
        payload = await request.json();
      } catch {
        return error(400, 'The body of the request must be valid JSON.');
      }
      // With a hairy style, we don't need to indicate the model: we use the one in the workshop
      payload.model ??= env.JEV_DEFAULT_MODEL ?? 'jev-latest';
      headers.set('content-type', 'application/json');
      body = JSON.stringify(payload);
    }
  }

  const upstream = await fetch(UPSTREAM + route.path, { method: route.method, headers, body });
  return passthrough(upstream);
};
