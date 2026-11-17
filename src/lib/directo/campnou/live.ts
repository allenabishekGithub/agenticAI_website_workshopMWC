// Live conversation with GPT-Live (WebRTC).
//
// - Microphone input and the assistant's voice travel over audio tracks; the data channel
//   `oai-events` has transcripts, delegations and backend events.
// - GPT-Live speaks and delegates to gpt-6-moon (Responses). When the backend calls a
//   function, the event arrives here: the page executes it (fill the form) while
//   the voice keeps talking, and the result returns with `response.item.create` + `response.create`.
// - Two AnalyserNode measure the level of the micro and voice of the animation assistant.

import { conToken } from '../token.ts'

export type LiveState = 'connecting' | 'live' | 'closing' | 'closed'

export type LiveToolCall = { callId: string; name: string; args: Record<string, unknown> }

export type LiveOptions = {
  instructions: string
  backendInstructions: string
  greeting: string
  /** Tools in the flat Responses format: { type, name, description, parameters }. */
  tools: unknown[]
  onState?: (state: LiveState) => void
  /** Transcript fragment with its interval in the session time line (ms). */
  onUserText?: (delta: string, startMs: number, endMs: number) => void
  onAgentText?: (delta: string, startMs: number, endMs: number) => void
  /** GPT-Live has passed work on to the backend. */
  onDelegation?: () => void
  /** The backend has finished (good or bad) the delegated task. */
  onBackendDone?: () => void
  /** Run the tool and return the text of the result. */
  onToolCall: (call: LiveToolCall) => Promise<string>
  /** Levels 0 to 1 of your voice and the assistant's, at screen rate. */
  onLevels?: (user: number, agent: number) => void
  onError?: (message: string) => void
}

type LiveEvent = {
  type: string
  delta?: string
  start_ms?: number
  end_ms?: number
  error?: { code?: string; message?: string }
  delegation_id?: string
  event?: {
    type: string
    item?: { type: string; call_id?: string; name?: string; arguments?: string }
  }
}

let eventCounter = 0
const eventId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${++eventCounter}`

function levelMeter(context: AudioContext, stream: MediaStream) {
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.6
  context.createMediaStreamSource(stream).connect(analyser)
  const data = new Float32Array(analyser.fftSize)
  let level = 0
  return () => {
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!
    const db = 20 * Math.log10(Math.sqrt(sum / data.length) + 1e-9)
    // -58 dB → 0, -12 dB → 1; climbs fast and falls slowly, like a vumeter.
    const target = Math.min(1, Math.max(0, (db + 58) / 46))
    level = target > level ? level * 0.4 + target * 0.6 : level * 0.88 + target * 0.12
    return level
  }
}

async function waitForIce(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === 'complete') return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.removeEventListener('icegatheringstatechange', onState)
      reject(new Error('Could not prepare WebRTC connection (ice).'))
    }, 10_000)
    function onState() {
      if (connection.iceGatheringState !== 'complete') return
      clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', onState)
      resolve()
    }
    connection.addEventListener('icegatheringstatechange', onState)
  })
}

export function createLiveSession(options: LiveOptions) {
  let state: LiveState = 'closed'
  let peer: RTCPeerConnection | null = null
  let channel: RTCDataChannel | null = null
  let microphone: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let frame = 0
  let closeTimeout: ReturnType<typeof setTimeout> | null = null
  let muted = false
  const audio = new Audio()
  audio.autoplay = true
  /** Calls to function already served (the same item can be repeated in several events). */
  const handledCalls = new Set<string>()

  const setState = (next: LiveState) => {
    if (state === next) return
    state = next
    options.onState?.(next)
  }

  function send(event: Record<string, unknown>) {
    if (channel?.readyState !== 'open') return false
    channel.send(JSON.stringify({ event_id: eventId('cn'), ...event }))
    return true
  }

  function cleanup() {
    if (closeTimeout) clearTimeout(closeTimeout)
    closeTimeout = null
    cancelAnimationFrame(frame)
    microphone?.getTracks().forEach((t) => t.stop())
    microphone = null
    const closing = channel
    channel = null
    closing?.close()
    peer?.close()
    peer = null
    audio.srcObject = null
    void audioContext?.close()
    audioContext = null
    handledCalls.clear()
    options.onLevels?.(0, 0)
    setState('closed')
  }

  async function runTool(item: NonNullable<NonNullable<LiveEvent['event']>['item']>) {
    const callId = item.call_id
    if (!callId || handledCalls.has(callId)) return
    handledCalls.add(callId)

    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(item.arguments || '{}')
    } catch {}

    let output: string
    try {
      output = await options.onToolCall({ callId, name: item.name ?? '', args })
    } catch (err) {
      output = JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
    }
    // Function result and then continue the backend: without `response.create` you are waiting.
    send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: callId, output } })
    send({ type: 'response.create' })
  }

  function onEvent(event: LiveEvent) {
    switch (event.type) {
      case 'session.started':
        setState('live')
        // Greeting: the same text that goes into `session.input`, now for you to say.
        send({ type: 'session.commentary.append', delegation_id: null, content: options.greeting })
        break
      case 'session.input_transcript.delta':
        if (event.delta) options.onUserText?.(event.delta, event.start_ms ?? 0, event.end_ms ?? 0)
        break
      case 'session.output_transcript.delta':
        if (event.delta) options.onAgentText?.(event.delta, event.start_ms ?? 0, event.end_ms ?? 0)
        break
      case 'session.delegation.created':
        options.onDelegation?.()
        break
      case 'response.event': {
        const inner = event.event
        if (!inner) break
        if (inner.type === 'response.output_item.done' && inner.item?.type === 'function_call') void runTool(inner.item)
        else if (inner.type === 'response.completed' || inner.type === 'response.failed' || inner.type === 'response.incomplete')
          options.onBackendDone?.()
        break
      }
      case 'session.closed':
        cleanup()
        break
      case 'error': {
        const message = event.error?.message ?? event.error?.code ?? 'GPT-Live error'
        console.warn('GPT-Live:', event.error)
        options.onError?.(message)
        break
      }
    }
  }

  async function start() {
    if (state !== 'closed') return
    setState('connecting')
    try {
      const connection = new RTCPeerConnection()
      peer = connection

      audioContext = new AudioContext()
      await audioContext.resume()

      let agentMeter: (() => number) | null = null
      connection.addEventListener('track', (event) => {
        const remote = new MediaStream([event.track])
        // Chrome only delivers remote audio to the Web Audio if it also sounds in a <audio>.
        audio.srcObject = remote
        audio.play().catch(() => options.onError?.('The browser has blocked the audio: tap the page to hear it.'))
        if (audioContext) agentMeter = levelMeter(audioContext, remote)
      })

      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      for (const track of microphone.getAudioTracks()) connection.addTrack(track, microphone)
      const userMeter = levelMeter(audioContext, microphone)

      const tick = () => {
        options.onLevels?.(muted ? 0 : userMeter(), agentMeter?.() ?? 0)
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)

      // The event channel is created before the SDP offer.
      channel = connection.createDataChannel('oai-events')
      const events = channel
      events.addEventListener('message', ({ data }) => {
        try {
          onEvent(JSON.parse(data))
        } catch (err) {
          console.warn('Invalid GPT-Live', err)
        }
      })
      events.addEventListener('close', () => {
        if (channel !== events) return
        if (state === 'live') options.onError?.('The connection to GPT-Live has been cut.')
        cleanup()
      })

      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      await waitForIce(connection)
      const sdp = connection.localDescription?.sdp
      if (!sdp) throw new Error('No SDP offer.')

      const res = await fetch('/api/directo/live-session', {
        method: 'POST',
        headers: conToken({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sdp,
          instructions: options.instructions,
          backendInstructions: options.backendInstructions,
          greeting: options.greeting,
          tools: options.tools,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; transport?: { sdp?: string } }
      if (!res.ok || !data.transport?.sdp) throw new Error(data.error ?? `HTTP ${res.status}`)
      if ((state as LiveState) !== 'connecting') return

      await connection.setRemoteDescription({ type: 'answer', sdp: data.transport.sdp })
      // HTTP request has already started the session: `session.start` is not sent.
    } catch (err) {
      cleanup()
      throw err
    }
  }

  /** Close with `session.close` and wait for `session.closed` (or 5 s) before releasing the micro. */
  function stop() {
    if (state === 'closed' || state === 'closing') return
    if (!send({ type: 'session.close' })) {
      cleanup()
      return
    }
    setState('closing')
    closeTimeout = setTimeout(cleanup, 5000)
  }

  function setMuted(next: boolean) {
    muted = next
    microphone?.getAudioTracks().forEach((t) => (t.enabled = !next))
    send({ type: next ? 'session.input_audio.mute' : 'session.input_audio.unmute' })
  }

  return {
    start,
    stop,
    setMuted,
    /** Ajago for GPT-Live that does not have to say aloud (e.g. what the user touches on the page). */
    note: (content: string) => send({ type: 'session.thinking.append', delegation_id: null, content }),
    get state() {
      return state
    },
    get muted() {
      return muted
    },
  }
}

export type LiveSession = ReturnType<typeof createLiveSession>
