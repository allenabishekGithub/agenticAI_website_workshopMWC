// Camp Nou Assistant Voice Mode.
//
// - The microphone enters 16 kHz by a AudioWorklet (PCM in rough, without MediaRecorder).
// - An energy voice detector, with adaptive noise floor, decides when you start
//   And when you just spoke.
// - While you're talking, Whisper (the same XWebGPU of /translator) re-transcribs the phrase
//   Every time he is free: the text appears live. When he is silent, a final pass.
// - The agent's response is read with speechSynthesis.

const SAMPLE_RATE = 16_000
/** Samples per grid of the worklet: 32 ms. */
const FRAME = 512
const ms = (n: number) => Math.round((n / 1000) * SAMPLE_RATE)

/** Audio that is saved before you detect voice, so you don't eat the first syllable. */
const PRE_ROLL = ms(350)
/** Steps followed above the threshold to give up the sentence (~96 ms). */
const START_FRAMES = 3
/** Silence that closes the sentence. */
const END_SILENCE = ms(850)
/** Minimum voice for the phrase to count (coughs, punches on the table...). */
const MIN_VOICE = ms(300)
/** Whisper works with 30 s windows. */
const MAX_UTTERANCE = ms(25_000)
/** New audio minimum between two partial transcripts. */
const PARTIAL_STEP = ms(250)
/** Silence left at the end of the audio going to Whisper. */
const TAIL = ms(200)

export type VoiceState = 'off' | 'loading' | 'listening' | 'hearing' | 'transcribing' | 'busy' | 'speaking'

export type VoiceOptions = {
  onState?: (state: VoiceState) => void
  onProgress?: (pct: number | null, label: string) => void
  /** Micro level from 0 to 1, to animate the interface. */
  onLevel?: (level: number) => void
  onSpeechStart?: () => void
  onPartial?: (text: string) => void
  /** Phrase finished. `ms` is what took the final final of Whisper. */
  onFinal?: (text: string, ms: number) => void
  /** The phrase was a noise or hallucination of Whisper. */
  onDiscard?: () => void
  onError?: (message: string) => void
}

type WorkerMessage = {
  status: string
  requestId?: number
  output?: string[] | string
  error?: string
  data?: string
  file?: string
  loaded?: number
  total?: number
}

// What Whisper invents when he hears noise (out of the subtitles he trained with).
const HALLUCINATIONS =
  /amara\.org|subt[ií]tul|gracias por ver|suscr[ií]bete|like y suscr|^\W*(m[uú]sica|aplausos)\W*$/i

function cleanTranscript(raw: string) {
  return (
    raw
      .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
      .replace(/\s+/g, ' ')
      // Whisper sometimes goes into loop ("What's going on? What's going on?..."): Leave a single copy.
      .replace(/(.{6,}?)(?:\s*\1){2,}/gi, '$1')
      .trim()
  )
}

function isNoise(text: string) {
  return !/[\p{L}\p{N}]/u.test(text) || HALLUCINATIONS.test(text)
}

const WORKLET = `
class CampNouMicTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${FRAME}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0 }
    }
    return true
  }
}
registerProcessor('camp-nou-mic-tap', CampNouMicTap)
`

function concat(chunks: Float32Array[], length?: number) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Float32Array(Math.min(total, length ?? total))
  let offset = 0
  for (const c of chunks) {
    if (offset >= out.length) break
    const part = c.subarray(0, out.length - offset)
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// ---------------------------------------------------------------------------
// Output voice
// ---------------------------------------------------------------------------

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('en'))
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.replace('_', '-').toLowerCase() === 'es-es' ? 4 : 0) +
    (/premium|enhanced|mejorad|neural|natural/i.test(v.name) ? 3 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    (v.localService ? 0 : 1)
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null
}

/** Text suitable for reading aloud. */
export function toSpeech(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Voice mode
// ---------------------------------------------------------------------------

export function createVoiceMode(options: VoiceOptions = {}) {
  let state: VoiceState = 'off'
  let worker: Worker | null = null
  let modelReady: Promise<void> | null = null

  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null

  // Voice detector
  let noiseFloor = 0.004
  let loudFrames = 0
  let preRoll: Float32Array[] = []
  let preRollLength = 0
  let utterance: Float32Array[] = []
  let utteranceLength = 0
  let voiced = 0
  let lastVoiceAt = 0
  let lastPartialAt = 0
  let level = 0

  // Whisper
  let requestId = 0
  let transcribing = false
  let latestPartial = ''
  const pending = new Map<number, { resolve: (text: string) => void; reject: (err: Error) => void }>()

  // Output voice
  let speaking: { utterances: SpeechSynthesisUtterance[]; done: () => void } | null = null

  const setState = (next: VoiceState) => {
    if (state === next) return
    state = next
    options.onState?.(next)
  }

  // ----- Whisper ------------------------------------------------------------

  function ensureWorker() {
    if (worker) return worker
    worker = new Worker(new URL('../whisper-worker.js', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data
      if (msg.status === 'complete' || (msg.status === 'error' && msg.requestId != null)) {
        const waiter = pending.get(msg.requestId!)
        if (!waiter) return
        pending.delete(msg.requestId!)
        if (msg.status === 'error') waiter.reject(new Error(msg.error))
        else waiter.resolve(String(Array.isArray(msg.output) ? msg.output[0] ?? '' : msg.output ?? ''))
      }
    })
    return worker
  }

  function loadModel() {
    if (modelReady) return modelReady
    const w = ensureWorker()
    const files = new Map<string, { loaded: number; total: number }>()

    modelReady = new Promise<void>((resolve, reject) => {
      const onMessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data
        switch (msg.status) {
          case 'progress': {
            if (!msg.file || !msg.total) break
            files.set(msg.file, { loaded: msg.loaded ?? 0, total: msg.total })
            let loaded = 0
            let total = 0
            for (const f of files.values()) {
              loaded += f.loaded
              total += f.total
            }
            options.onProgress?.(total ? Math.round((loaded / total) * 100) : null, 'Downloading Whisper')
            break
          }
          case 'loading':
            if (msg.data?.startsWith('Compiling')) options.onProgress?.(null, 'Warming Whisper in the GPU')
            break
          case 'ready':
            w.removeEventListener('message', onMessage)
            resolve()
            break
          case 'error':
            if (msg.requestId != null) break
            w.removeEventListener('message', onMessage)
            modelReady = null
            reject(new Error(msg.error))
            break
        }
      }
      w.addEventListener('message', onMessage)
    })
    options.onProgress?.(null, 'Loading Whisper')
    w.postMessage({ type: 'load' })
    return modelReady
  }

  function transcribe(audio: Float32Array) {
    const id = ++requestId
    transcribing = true
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Whisper no ha respondido a tiempo.'))
      }, 15_000)
      pending.set(id, {
        resolve: (text) => (clearTimeout(timeout), resolve(text)),
        reject: (err) => (clearTimeout(timeout), reject(err)),
      })
      worker!.postMessage({ type: 'generate', data: { audio, language: 'english', requestId: id } })
    }).finally(() => {
      transcribing = false
    })
  }

  async function partial() {
    lastPartialAt = utteranceLength
    const audio = concat(utterance)
    try {
      const text = cleanTranscript(await transcribe(audio))
      // It can come when the sentence has already been closed: then send the final pass.
      if (state !== 'hearing' || !text || isNoise(text)) return
      latestPartial = text
      options.onPartial?.(text)
    } catch {
      // A lost partial does not matter: the following replaces it.
    }
  }

  async function finish() {
    setState('transcribing')
    const voicedEnough = voiced >= MIN_VOICE
    const audio = concat(utterance, Math.min(utteranceLength, lastVoiceAt + TAIL))
    resetUtterance()

    if (!voicedEnough) {
      options.onDiscard?.()
      listen()
      return
    }

    // Wait until the partial is done (the iraes do one thing at a time).
    while (transcribing) await new Promise((r) => setTimeout(r, 15))
    if (state !== 'transcribing') return

    const startedAt = performance.now()
    let text = ''
    try {
      text = cleanTranscript(await transcribe(audio))
    } catch (err) {
      // If the final fails, it's worth the last thing seen on screen.
      text = latestPartial
      if (!text) {
        options.onError?.(err instanceof Error ? err.message : String(err))
        listen()
        return
      }
    }
    if (state !== 'transcribing') return

    if (!text || isNoise(text)) {
      options.onDiscard?.()
      listen()
      return
    }
    setState('busy')
    options.onFinal?.(text, Math.round(performance.now() - startedAt))
  }

  // ----- Microphone and voice detector -------VASVAS

  function resetUtterance() {
    utterance = []
    utteranceLength = 0
    voiced = 0
    lastVoiceAt = 0
    lastPartialAt = 0
    loudFrames = 0
    latestPartial = ''
  }

  function onFrame(frame: Float32Array) {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!
    const rms = Math.sqrt(sum / frame.length)

    // Level in logarithmic scale (-60 dB → 0, -10 dB → 1), softened.
    const db = 20 * Math.log10(rms + 1e-9)
    level = level * 0.6 + Math.min(1, Math.max(0, (db + 60) / 50)) * 0.4
    options.onLevel?.(level)

    const threshold = Math.max(0.008, noiseFloor * 3.2)
    const loud = rms > threshold

    if (state === 'hearing') {
      utterance.push(frame)
      utteranceLength += frame.length
      if (rms > threshold * 0.6) {
        voiced += frame.length
        lastVoiceAt = utteranceLength
      }
      if (utteranceLength - lastVoiceAt >= END_SILENCE || utteranceLength >= MAX_UTTERANCE) {
        void finish()
        return
      }
      if (!transcribing && utteranceLength - lastPartialAt >= PARTIAL_STEP && voiced >= ms(150)) void partial()
      return
    }

    // Outside one sentence: the floor of noise quickly drops and rises slowly.
    if (!loud) noiseFloor = rms < noiseFloor ? noiseFloor * 0.9 + rms * 0.1 : noiseFloor * 0.995 + rms * 0.005

    preRoll.push(frame)
    preRollLength += frame.length
    while (preRollLength - preRoll[0]!.length >= PRE_ROLL) preRollLength -= preRoll.shift()!.length

    if (state !== 'listening') {
      loudFrames = 0
      return
    }

    loudFrames = loud ? loudFrames + 1 : 0
    if (loudFrames < START_FRAMES) return

    resetUtterance()
    utterance = preRoll
    utteranceLength = preRollLength
    voiced = START_FRAMES * FRAME
    lastVoiceAt = utteranceLength
    preRoll = []
    preRollLength = 0
    setState('hearing')
    options.onSpeechStart?.()
  }

  async function openMic() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not allow the microphone to be used.')
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    // Safari creates it suspended if there is no longer a user gesture (after permission from the micro).
    await audioContext.resume()
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    try {
      await audioContext.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const source = audioContext.createMediaStreamSource(stream)
    const tap = new AudioWorkletNode(audioContext, 'camp-nou-mic-tap')
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data)
    source.connect(tap)
  }

  function closeMic() {
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    void audioContext?.close()
    audioContext = null
    preRoll = []
    preRollLength = 0
    level = 0
    options.onLevel?.(0)
  }

  // ----- API ----------------------------------------------------------------

  function listen() {
    if (state === 'off') return
    resetUtterance()
    setState('listening')
  }

  async function start() {
    if (state !== 'off') return
    if (!('gpu' in navigator)) throw new Error('Voice mode needs WebGPU (Chrome, Edge or Safari 26).')
    setState('loading')
    // Load the voices of speechSynthesis, which in Chrome are late.
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices()
    try {
      // The permission of the micro is requested while the model is being downloaded.
      await Promise.all([openMic(), loadModel()])
    } catch (err) {
      stop()
      throw err
    }
    // It went out of voice mode during the discharge: the microphone opened late, close it.
    if ((state as VoiceState) !== 'loading') {
      closeMic()
      return
    }
    listen()
  }

  function stop() {
    cancelSpeech()
    closeMic()
    resetUtterance()
    setState('off')
  }

  /** Close the current sentence, without waiting for silence. */
  function commit() {
    if (state === 'hearing') void finish()
  }

  function cancelSpeech() {
    if (!speaking) return
    const { done } = speaking
    speaking = null
    speechSynthesis.cancel()
    done()
  }

  /** Read the text aloud. When you finish (or interrupt) you listen again. */
  function speak(text: string) {
    const clean = toSpeech(text)
    if (state === 'off') return Promise.resolve()
    if (!clean || typeof speechSynthesis === 'undefined') {
      listen()
      return Promise.resolve()
    }

    cancelSpeech()
    setState('speaking')
    const voice = pickSpanishVoice()
    // Phrase to phrase: Chrome cuts long locutions.
    const sentences = clean.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean]

    return new Promise<void>((resolve) => {
      let finished = false
      const done = () => {
        if (finished) return
        finished = true
        clearTimeout(safety)
        speaking = null
        // A breather so the mic doesn't pick up the end of his own voice.
        setTimeout(() => {
          if (state === 'speaking') listen()
          resolve()
        }, 250)
      }
      // In case speechSynthesis hangs without firing onend.
      const safety = setTimeout(() => cancelSpeech(), 4000 + clean.length * 90)

      const utterances = sentences.map((sentence, i) => {
        const u = new SpeechSynthesisUtterance(sentence)
        u.lang = voice?.lang ?? 'en-GB'
        if (voice) u.voice = voice
        u.rate = 1.08
        if (i === sentences.length - 1) u.onend = done
        u.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') console.warn('speechSynthesis:', e.error)
          done()
        }
        return u
      })
      // They are saved so that the garbage collector does not eat them in half (Chrome's bug).
      speaking = { utterances, done }
      for (const u of utterances) speechSynthesis.speak(u)
    })
  }

  return {
    start,
    stop,
    listen,
    commit,
    speak,
    /** For the assistant's voice and listen again. */
    interrupt: () => {
      cancelSpeech()
      listen()
    },
    /** The agent works: it is not heard until he answers. */
    hold: () => {
      if (state !== 'off') setState('busy')
    },
    get state() {
      return state
    },
  }
}

export type VoiceMode = ReturnType<typeof createVoiceMode>
