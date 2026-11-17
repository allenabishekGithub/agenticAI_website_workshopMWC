import type { APIRoute } from 'astro';
import { env, error, guard, json, passthrough, preflight } from '../../../lib/proxy';

export const prerender = false;

const UPSTREAM = 'https://api.openai.com';

// OpenAI Endpoints available in the workshop
const POST_ROUTES = new Set(['v1/chat/completions', 'v1/responses']);

function allowedModels(): string[] {
  return (env.OPENAI_MODELS ?? 'gpt-6-luna')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

export const OPTIONS: APIRoute = () => preflight();

export const GET: APIRoute = async ({ request, params }) => {
  if (params.path !== 'v1/models') return error(404, 'Route unavailable.');

  const blocked = await guard(request);
  if (blocked) return blocked;

  return json({
    object: 'list',
    data: allowedModels().map((id) => ({ id, object: 'model', owned_by: 'openai' })),
  });
};

export const POST: APIRoute = async ({ request, params }) => {
  const path = params.path ?? '';
  if (!POST_ROUTES.has(path)) {
    return error(404, 'Route not available. Use /v1/chat/completions or /v1/responses.');
  }

  const blocked = await guard(request);
  if (blocked) return blocked;

  if (!env.OPENAI_API_KEY) return error(500, 'The server does not have OPENAI_API_KEY configured.');

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return error(400, 'The body of the request must be valid JSON.');
  }

  const models = allowedModels();
  payload.model ??= models[0];
  if (typeof payload.model !== 'string' || !models.includes(payload.model)) {
    return error(
      400,
      `Model not available in the workshop. ${models.join(', ')}.`,
      'model_not_allowed',
    );
  }

  const upstream = await fetch(`${UPSTREAM}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return passthrough(upstream);
};
