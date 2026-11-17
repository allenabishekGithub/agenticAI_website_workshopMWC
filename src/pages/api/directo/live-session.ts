import type { APIRoute } from 'astro'
import { env, guard } from '../../../lib/proxy'

export const prerender = false

/**
 * Opens a GPT-Live session by WebRTC for the Camp Nou wizard.
 *
 * The browser sends its offer SDP and the hosts (are generated on the page with the
 * Today's calendar); the server adds the key and creates the session with
 * `POST /v1/live/sessions`. GPT-Live conducts the conversation and delegates to gpt-6-moon
 * (Responses), which calls the form's WebMCP tool.
 * the page runs: it arrives through the data channel and returns with `response.item.create`.
 */

const LIVE_URL = 'https://api.openai.com/v1/live/sessions'
const LIVE_MODEL = 'gpt-live-1'
const BACKEND_MODEL = 'gpt-6-luna'
const VOICE = 'marin'

const MAX_SDP = 64 * 1024
const MAX_PROMPT = 48 * 1024

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Body = {
  sdp?: unknown
  instructions?: unknown
  backendInstructions?: unknown
  greeting?: unknown
  tools?: unknown
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export const POST: APIRoute = async ({ request }) => {
  // With the token from the workshop, like the rest of the APIs
  const blocked = await guard(request)
  if (blocked) return blocked

  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured on the server.' }, 500)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }

  const { sdp, instructions, backendInstructions, greeting, tools } = body
  if (!isText(sdp, MAX_SDP)) return json({ error: 'The SDP offer is missing.' }, 400)
  if (!isText(instructions, MAX_PROMPT) || !isText(backendInstructions, MAX_PROMPT)) {
    return json({ error: 'The session instructions are missing.' }, 400)
  }
  if (!Array.isArray(tools) || tools.length > 8 || JSON.stringify(tools).length > MAX_PROMPT) {
    return json({ error: 'Invalid tools.' }, 400)
  }

  const session = {
    model: LIVE_MODEL,
    instructions,
    audio: { output: { voice: VOICE } },
    // The greeting goes here too: this is how it is available from the very first moment.
    input: isText(greeting, 2000) ? [{ role: 'developer', content: [{ type: 'input_text', text: greeting }] }] : [],
    delegation: {
      type: 'responses',
      responses: {
        model: BACKEND_MODEL,
        instructions: backendInstructions,
        tools: tools.map((raw) => {
          const t = raw as Record<string, unknown>
          return {
            type: 'function',
            name: String(t.name ?? ''),
            description: typeof t.description === 'string' ? t.description : undefined,
            parameters: t.parameters ?? { type: 'object', properties: {} },
            strict: false,
          }
        }),
        tool_choice: 'auto',
        // The form is one: one call every time.
        parallel_tool_calls: false,
        reasoning: { effort: 'medium' },
      },
    },
  }

  try {
    const upstream = await fetch(LIVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ session, transport: { type: 'webrtc', sdp } }),
    })

    if (!upstream.ok) {
      const errorText = await upstream.text()
      return json({ error: `GPT-Live ${upstream.status}: ${errorText.slice(0, 600)}` }, upstream.status)
    }

    // { session: { id }, transport: { type: 'webrtc', sdp } }
    return json(await upstream.json(), 201)
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 502)
  }
}
