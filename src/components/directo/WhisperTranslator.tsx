import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './translator.css'

const WHISPER_SAMPLING_RATE = 16_000
const MAX_AUDIO_LENGTH = 30
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH

const LANGUAGES: Record<string, { label: string; whisper: string }> = {
  es: { label: 'Spanish', whisper: 'spanish' },
  en: { label: 'English', whisper: 'english' },
  fr: { label: 'French', whisper: 'french' },
  de: { label: 'German', whisper: 'german' },
  it: { label: 'Italian', whisper: 'italian' },
  ja: { label: 'Japanese', whisper: 'japanese' },
}

type Status = null | 'loading' | 'ready'

// Translation engine: API Tranhal from Chrome, or Bergamot (the Firefox engine) in WASM
// with Firefox models. The local works in any browser and covers
// all languages: couples without direct model pass through English (en → en → ja).
type Engine = 'chrome' | 'local'
type TextTranslator = { engine: Engine; translate: (text: string) => Promise<string> }
// Preparation status for each engine and torque (`local:es->en`). `fallback`: Chrome failed and the local is used.
type Load = { state: 'loading' | 'ready' | 'error'; progress?: number; fallback?: boolean }
type LocalModule = typeof import('runonweb/translate')
type LocalEngine = { translator: InstanceType<LocalModule['Translator']>; resolveRoute: LocalModule['resolveRoute'] }
type LocalLoad = { key: string; weights: Map<string, number>; total: number; done: Map<string, number> }
type TranslationJob = { text: string; src: string; tgt: string; session: number }
// `pair` is the most recent order pair: an old translation that comes late does not tread on the new one.
type Paragraph = { id: number; source: string; target: string; pair: string }

// Mirror with CORS from Mozilla models (its U.N. does not send CORS headers).
const LOCAL_MODELS = 'https://huggingface.co/midudev/firefox-translations/resolve/main/'
const hasChromeTranslator = typeof (globalThis as any).Translator !== 'undefined'
const hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as any).gpu
// The Chrome's Tranche.() can be hung by downloading the language package.
// If you pass this time without progress, you abort and use the local engine.
const CHROME_STALL_MS = 10_000
const SENTENCE_CACHE_SIZE = 500
// Point and aside: after this silence the paragraph is closed and Whisper starts a new audio stretch.
const SILENCE_MS = 1200
// Voice Threshold (RMS): the highest between this minimum and background noise multiplied by VOICE_OVER_NOISE.
const MIN_VOICE_RMS = 0.01
const VOICE_OVER_NOISE = 3
const MAX_PARAGRAPHS = 20

const loadKey = (engine: Engine, src: string, tgt: string) => `${engine}:${src}->${tgt}`

// Whisper rewrites the entire audio window in each pass, but phrases already said almost no
// change: it translates phrase by sentence and only the new goes through the model; the rest comes out of cache.
// Thus each update costs a sentence and not the entire paragraph.
function bySentence(engine: Engine, src: string, tgt: string, translate: (text: string) => Promise<string>): TextTranslator {
  const segmenter = new Intl.Segmenter(src, { granularity: 'sentence' })
  const joiner = tgt === 'ja' ? '' : ' '
  const cache = new Map<string, Promise<string>>()

  const one = (sentence: string) => {
    let hit = cache.get(sentence)
    if (!hit) {
      hit = translate(sentence)
      cache.set(sentence, hit)
      hit.catch(() => cache.delete(sentence))
      if (cache.size > SENTENCE_CACHE_SIZE) cache.delete(cache.keys().next().value!)
    }
    return hit
  }

  return {
    engine,
    translate: async (text) => {
      const sentences = [...segmenter.segment(text)].map(({ segment }) => segment.trim()).filter(Boolean)
      return (await Promise.all(sentences.map(one))).join(joiner)
    },
  }
}

function startRecorder(recorder: MediaRecorder | null) {
  try {
    if (recorder?.state === 'inactive') recorder.start(250)
  } catch {
    // The valentine can be halfway through state-to-state transition.
  }
}

function stopRecorder(recorder: MediaRecorder | null) {
  try {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  } catch {
    // Avoid to lie down React if gram() is called twice.
  }
}

function requestRecorderData(recorder: MediaRecorder | null) {
  try {
    if (recorder?.state === 'recording') recorder.requestData()
  } catch {
    // requestData() launches InvalidStateError if the runner no longer records.
  }
}

function formatBytes(size: number) {
  if (size === 0) return '0 B'
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return (size / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + ['B', 'kB', 'MB', 'GB'][i]
}

// ─── Sub-components ──────────────────────────────────────────────

function AudioVisualizer({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (!stream) return
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)

    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const data = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(data)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.lineWidth = 2
      ctx.strokeStyle = activeRef.current ? '#ff313c' : '#404040'
      ctx.beginPath()

      const sliceWidth = canvas.width / data.length
      let x = 0
      for (let i = 0; i < data.length; i++) {
        const y = ((data[i] / 128) * canvas.height) / 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }
      ctx.lineTo(canvas.width, canvas.height / 2)
      ctx.stroke()
    }
    draw()

    return () => {
      cancelAnimationFrame(frame)
      audioContext.close()
    }
  }, [stream])

  return <canvas className="tr-wave" width={1440} height={160} ref={canvasRef} aria-hidden="true" />
}

function LanguageSelect({
  label,
  language,
  onChange,
}: {
  label: string
  language: string
  onChange: (lang: string) => void
}) {
  return (
    <select className="tr-select" aria-label={label} value={language} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(LANGUAGES).map(([key, { label }]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}

// Subtitle of fixed height: text grows from below and old goes up and fades (mask
// in CSS). When a new line arrives, the paragraph slides upward instead of jumping.
function Caption({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let height = el.offsetHeight
    const observer = new ResizeObserver(() => {
      const next = el.offsetHeight
      const delta = next - height
      height = next
      if (delta <= 0 || reducedMotion.matches) return
      // `add`: If another line comes in in the middle of animation, it adds to the one that already runs and does not pull.
      el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
        duration: 350,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        composite: 'add',
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={`tr-caption ${className}`}>
      <div ref={ref}>{children}</div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────

export default function WhisperTranslator() {
  const worker = useRef<Worker | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const translatorCacheRef = useRef(new Map<string, Promise<TextTranslator>>())
  const localEngineRef = useRef<Promise<LocalEngine> | null>(null)
  const localLoadsRef = useRef(new Set<LocalLoad>())
  const pendingJobRef = useRef<TranslationJob | null>(null)
  const translatingRef = useRef(false)
  const shownTranslationRef = useRef('')
  const previousTextRef = useRef('')
  const restartOnStopRef = useRef(false)
  const resettingRef = useRef(false)
  const sessionRef = useRef(0)
  // Detection of silence (see effect on `stream`).
  const hadVoiceRef = useRef(false)
  const lastVoiceAtRef = useRef(0)
  const breakPendingRef = useRef(false)
  const awaitingVoiceRef = useRef(false)
  const recorderStartedAtRef = useRef(0)
  const paragraphIdRef = useRef(0)
  const speedTracker = useRef<Map<string, { lastLoaded: number; lastTime: number; speed: number }>>(new Map())

  // `status` is Whisper, which is preloaded when opening the page; `started`, if already clicked "start".
  const [status, setStatus] = useState<Status>(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)
  // By default, the local: is prepared by opening the page without clicking. Chrome, with T.
  const [engine, setEngine] = useState<Engine>('local')
  const engineRef = useRef(engine)
  engineRef.current = engine
  const [loads, setLoads] = useState<Record<string, Load>>({})
  const [loadingMessage, setLoadingMessage] = useState('')
  const [progressItems, setProgressItems] = useState<any[]>([])
  const [micError, setMicError] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const translatedTextRef = useRef(translatedText)
  translatedTextRef.current = translatedText
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])
  const [tps, setTps] = useState<number | null>(null)
  const [sourceLanguage, setSourceLanguage] = useState('es')
  const [targetLanguage, setTargetLanguage] = useState('en')

  const [recording, setRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [chunks, setChunks] = useState<Blob[]>([])
  const [stream, setStream] = useState<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  // Hole in the header of the page for the qualifiers (the component is a client: 207).
  const [headerSlot] = useState(() => document.getElementById('tr-controls'))

  const restartRecorder = () => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'inactive') {
      resettingRef.current = false
      // With Whisper preloaded, changing language before "starting" should not start recording.
      if (startedRef.current) startRecorder(recorder)
      return
    }
    restartOnStopRef.current = true
    stopRecorder(recorder)
  }

  // Throw out the audio and text in progress and start recording a new stage.
  const startNewSegment = () => {
    sessionRef.current += 1
    setText('')
    setTranslatedText('')
    pendingJobRef.current = null
    shownTranslationRef.current = ''
    previousTextRef.current = ''
    setChunks([])
    resettingRef.current = true
    restartRecorder()
  }

  const resetTexts = () => {
    startNewSegment()
    setParagraphs([])
    setTps(null)
    hadVoiceRef.current = false
    breakPendingRef.current = false
    awaitingVoiceRef.current = false
  }

  const updateLoad = (key: string, patch: Partial<Load>) =>
    setLoads((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { state: 'loading' }), ...patch } }))

  const createChromeTranslator = async (src: string, tgt: string): Promise<TextTranslator> => {
    const api = (globalThis as any).Translator
    if (!api) throw new Error('No API TRADDLE')
    const availability = await api.availability({ sourceLanguage: src, targetLanguage: tgt })
    if (availability === 'unavailable') throw new Error(`Chrome no traduce ${src} → ${tgt}`)

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const watchdog = () => {
      clearTimeout(timer)
      timer = setTimeout(
        () => controller.abort(new Error(`Chrome did not finish preparing ${src} → ${tgt} (${availability})`)),
        CHROME_STALL_MS
      )
    }
    // In case create() ignores the signal: abort still rejects the raced promise.
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason))
    })

    watchdog()
    try {
      const translator = await Promise.race([
        api.create({
          sourceLanguage: src,
          targetLanguage: tgt,
          signal: controller.signal,
          monitor(m: EventTarget) {
            m.addEventListener('downloadprogress', (e: any) => {
              watchdog()
              updateLoad(loadKey('chrome', src, tgt), { progress: e.loaded })
            })
          },
        }),
        aborted,
      ])
      // Heat the model: the first real translation no longer pays the charge in memory.
      await translator.translate('hola')
      return bySentence('chrome', src, tgt, (text) => translator.translate(text))
    } finally {
      clearTimeout(timer)
    }
  }

  // One single Tranche of runonweb (one group and one runtime WASM) for all pairs: each pair
  // is unloaded and loaded on it the first time it is ordered. The constructor's is the first.
  const getLocalEngine = (src: string, tgt: string) => {
    if (localEngineRef.current) return localEngineRef.current
    const promise = import('runonweb/translate').then(({ Translator, resolveRoute }) => ({
      resolveRoute,
      translator: new Translator({
        from: src,
        to: tgt,
        modelPath: LOCAL_MODELS,
        onProgress: ({ status, file, progress }) => {
          if (status !== 'progress' || !file || progress == null) return
          for (const load of localLoadsRef.current) {
            const weight = load.weights.get(file)
            if (weight == null) continue
            load.done.set(file, (progress / 100) * weight)
            let done = 0
            for (const value of load.done.values()) done += value
            updateLoad(load.key, { progress: done / load.total })
          }
        },
      }),
    }))
    localEngineRef.current = promise
    promise.catch(() => {
      if (localEngineRef.current === promise) localEngineRef.current = null
    })
    return promise
  }

  const createLocalTranslator = async (src: string, tgt: string): Promise<TextTranslator> => {
    const { translator, resolveRoute } = await getLocalEngine(src, tgt)

    // Weighted progress by size: the model weighs ~30-44 MB, the shortlist and vocabulary, little.
    const weights = new Map<string, number>()
    for (const entry of resolveRoute(src, tgt) ?? []) {
      weights.set(entry.files.model, entry.bytes)
      weights.set(entry.files.lex, 5e6)
      for (const vocab of [entry.files.vocab, entry.files.srcvocab, entry.files.trgvocab]) if (vocab) weights.set(vocab, 1e6)
    }
    let total = 0
    for (const weight of weights.values()) total += weight
    const load: LocalLoad = { key: loadKey('local', src, tgt), weights, total, done: new Map() }

    localLoadsRef.current.add(load)
    try {
      // The first translation downloads the pair, loads it into the iraet and heats up maran:
      // The first real sentence no longer pays the memory reserve.
      await translator.translate('hola', { from: src, to: tgt })
    } finally {
      localLoadsRef.current.delete(load)
    }
    return bySentence('local', src, tgt, async (text) => (await translator.translate(text, { from: src, to: tgt })).text)
  }

  // If you order Chrome but do not have the API or that pair, it falls to the local engine (which is usually ready).
  const getTranslator = (src: string, tgt: string, wanted: Engine = engineRef.current): Promise<TextTranslator> => {
    const key = loadKey(wanted, src, tgt)
    let promise = translatorCacheRef.current.get(key)
    if (!promise) {
      updateLoad(key, { state: 'loading', progress: undefined, fallback: false })
      promise =
        wanted === 'chrome'
          ? createChromeTranslator(src, tgt).catch((error) => {
              console.info('Narrow from Chrome not available, use local model:', error)
              updateLoad(key, { fallback: true })
              return getTranslator(src, tgt, 'local')
            })
          : createLocalTranslator(src, tgt)
      translatorCacheRef.current.set(key, promise)
      promise.then(
        () => updateLoad(key, { state: 'ready' }),
        (error) => {
          console.error('Could not prepare translator:', error)
          translatorCacheRef.current.delete(key)
          updateLoad(key, { state: 'error' })
        }
      )
    }
    return promise
  }

  // Tranche.() by Chrome may have to download the language package, and that asks
  // a user gesture: that's why it's called from clicks. With the pair ready it is also prepared
  // the reverse in local, so that exchanging languages (I) live is instantaneous.
  const warmTranslator = (src: string, tgt: string, wanted: Engine = engineRef.current) => {
    if (src === tgt) return
    getTranslator(src, tgt, wanted)
      .then(() => getTranslator(tgt, src, 'local'))
      .catch(() => {
        // The error is already left in `loads` and shown in the interface.
      })
  }

  // Single-hole glue: always translates the latest text as soon as the engine is left
  // No debounce, which while Whisper keeps writing never let translate.
  const requestTranslation = useCallback((text: string, src: string, tgt: string) => {
    pendingJobRef.current = { text, src, tgt, session: sessionRef.current }
    if (translatingRef.current) return
    translatingRef.current = true

    void (async () => {
      while (pendingJobRef.current) {
        const job = pendingJobRef.current
        pendingJobRef.current = null
        const wanted = engineRef.current
        const id = `${loadKey(wanted, job.src, job.tgt)}:${job.text}`
        if (!job.text.trim() || id === shownTranslationRef.current) continue

        try {
          const translation =
            job.src === job.tgt ? job.text : await (await getTranslator(job.src, job.tgt, wanted)).translate(job.text)
          if (job.session !== sessionRef.current) continue
          shownTranslationRef.current = id
          setTranslatedText(translation)
          const key = loadKey(wanted, job.src, job.tgt)
          setLoads((prev) => (prev[key]?.state === 'error' ? { ...prev, [key]: { ...prev[key], state: 'ready' } } : prev))
        } catch (error) {
          console.error('Could not translate:', error)
          updateLoad(loadKey(wanted, job.src, job.tgt), { state: 'error' })
        }
      }
      translatingRef.current = false
    })()
  }, [])

  const translateParagraph = (id: number, source: string, src: string, tgt: string) => {
    const pair = `${src}->${tgt}`
    const done = (target: string) =>
      setParagraphs((prev) => prev.map((p) => (p.id === id && p.pair === pair ? { ...p, target } : p)))
    setParagraphs((prev) => prev.map((p) => (p.id === id ? { ...p, pair } : p)))
    if (src === tgt) return done(source)
    getTranslator(src, tgt)
      .then((translator) => translator.translate(source))
      .then(done, (error) => console.error('Could not translate paragraph:', error))
  }

  // Point and separate: the current text becomes a closed paragraph (with final translation)
  // and Whisper starts from scratch with new audio, which is also shorter and transcribed earlier.
  const commitParagraph = (finalText: string, src: string, tgt: string) => {
    breakPendingRef.current = false
    hadVoiceRef.current = false
    awaitingVoiceRef.current = true
    const source = finalText.trim()
    if (source) {
      const id = ++paragraphIdRef.current
      // As long as the definitive translation arrives, the one you saw stays, so as not to blink.
      setParagraphs((prev) => [...prev.slice(1 - MAX_PARAGRAPHS), { id, source, target: translatedTextRef.current, pair: '' }])
      translateParagraph(id, source, src, tgt)
    }
    startNewSegment()
  }

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL('../../lib/directo/whisper-worker.js', import.meta.url), { type: 'module' })
    }

    const onMessage = (e: MessageEvent) => {
      switch (e.data.status) {
        case 'loading':
          setStatus('loading')
          setLoadingMessage(e.data.data)
          break
        case 'initiate':
          setProgressItems((prev) => [...prev, e.data])
          break
        case 'progress': {
          const now = performance.now()
          const file = e.data.file
          const loaded = e.data.loaded ?? 0
          let speed = 0

          const prev = speedTracker.current.get(file)
          if (prev) {
            const dt = (now - prev.lastTime) / 1000
            if (dt > 0.3) {
              speed = (loaded - prev.lastLoaded) / dt
              speedTracker.current.set(file, { lastLoaded: loaded, lastTime: now, speed })
            } else {
              speed = prev.speed
            }
          } else {
            speedTracker.current.set(file, { lastLoaded: loaded, lastTime: now, speed: 0 })
          }

          setProgressItems((items) => items.map((item) => (item.file === file ? { ...item, ...e.data, speed } : item)))
          break
        }
        case 'done':
          speedTracker.current.delete(e.data.file)
          setProgressItems((prev) => prev.filter((item) => item.file !== e.data.file))
          break
        case 'ready':
          setStatus('ready')
          if (startedRef.current) startRecorder(recorderRef.current)
          break
        case 'error':
          // Without this, a failure left the charge or transcription hanging forever.
          console.error('Whisper:', e.data.error)
          setIsProcessing(false)
          if (e.data.requestId == null) setStatus(null)
          break
        case 'start':
          setIsProcessing(true)
          requestRecorderData(recorderRef.current)
          break
        case 'update':
          setTps(e.data.tps)
          break
        case 'complete': {
          setIsProcessing(false)
          if (e.data.requestId !== sessionRef.current) {
            setChunks((prev) => prev.slice())
            return
          }

          const output = e.data.output[0] || e.data.output
          const newText = typeof output === 'string' && output.trim() !== '[BLANK_AUDIO]' ? output : ''

          if (newText) {
            setText(newText)
            if (newText.trim() !== previousTextRef.current.trim()) {
              previousTextRef.current = newText
              requestTranslation(newText, sourceLanguage, targetLanguage)
            }
          }

          // There was a long silence and this pass already includes the end of what was said: point and apart.
          if (breakPendingRef.current && e.data.audioEnd >= lastVoiceAtRef.current + 200) {
            commitParagraph(newText || previousTextRef.current, sourceLanguage, targetLanguage)
          }
          break
        }
      }
    }

    worker.current.addEventListener('message', onMessage)

    return () => {
      worker.current?.removeEventListener('message', onMessage)
    }
  }, [sourceLanguage, targetLanguage, requestTranslation])

  // Whisper and local engine do not need user gesture: nothing is downloaded and heated
  // The more you open the page, so everything is ready when you click "start" (and the local is a plan B
  // Instant if Chrome fails). Chrome is only prepared already if you have the language installed; if there is
  // download it, ask for a click.
  useEffect(() => {
    if (!hasWebGPU) return
    loadWhisper()
    warmTranslator(sourceLanguage, targetLanguage, 'local')
    if (!hasChromeTranslator) return
    ;(globalThis as any).Translator.availability({ sourceLanguage, targetLanguage })
      .then((availability: string) => {
        if (availability === 'available') warmTranslator(sourceLanguage, targetLanguage, 'chrome')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (recorderRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('This browser does not allow the microphone to be used.')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        setStream(stream)
        recorderRef.current = new MediaRecorder(stream)
        audioContextRef.current = new AudioContext({ sampleRate: WHISPER_SAMPLING_RATE })

        recorderRef.current.onstart = () => {
          resettingRef.current = false
          recorderStartedAtRef.current = performance.now()
          setRecording(true)
          setChunks([])
        }
        recorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            setChunks((prev) => [...prev, e.data])
          } else {
            setTimeout(() => requestRecorderData(recorderRef.current), 25)
          }
        }
        recorderRef.current.onstop = () => {
          setRecording(false)
          if (!restartOnStopRef.current) return
          restartOnStopRef.current = false
          startRecorder(recorderRef.current)
        }
        // If you clicked "start" with Whisper already ready before giving permission to the microphone.
        if (startedRef.current && statusRef.current === 'ready') startRecorder(recorderRef.current)
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err)
        setMicError('No permission for the microphone.')
      })

    return () => {
      restartOnStopRef.current = false
      stopRecorder(recorderRef.current)
      recorderRef.current = null
    }
  }, [])

  useEffect(() => {
    if (resettingRef.current) return
    // After a point and apart it does not transcribe silence (Whisper is invented "Thanks."): it is expected to
    // It only happens if the detector has heard voice before, so it never blocks.
    if (awaitingVoiceRef.current) return
    if (!recorderRef.current || !recording || isProcessing || status !== 'ready') return

    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: recorderRef.current.mimeType })
      const fileReader = new FileReader()

      fileReader.onloadend = async () => {
        const arrayBuffer = fileReader.result
        if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
          requestRecorderData(recorderRef.current)
          return
        }
        const audioContext = audioContextRef.current
        if (!audioContext || !worker.current) return

        try {
          const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
          let audio = decoded.getChannelData(0)
          if (audio.length > MAX_SAMPLES) audio = audio.slice(-MAX_SAMPLES)
          // Instant (VII.21) in which this audio ends: it says whether it already includes the end of the sentence.
          const audioEnd = recorderStartedAtRef.current + decoded.duration * 1000
          worker.current.postMessage({
            type: 'generate',
            data: {
              audio,
              language: LANGUAGES[sourceLanguage]?.whisper ?? sourceLanguage,
              requestId: sessionRef.current,
              audioEnd,
            },
          })
        } catch (error) {
          console.error('Error decoding recorded audio:', error)
          requestRecorderData(recorderRef.current)
        }
      }
      fileReader.readAsArrayBuffer(blob)
    } else {
      requestRecorderData(recorderRef.current)
    }
  }, [status, recording, isProcessing, chunks, sourceLanguage])

  // Silence detector: measures the volume of the micro every 100 ms against background noise (which is
  // After SILENCE_MS without voice, it marks a point and apart, which is done as soon as Whisper
  // returns a pass that already includes the end of what was said (see '48').
  useEffect(() => {
    if (!stream) return
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Float32Array(analyser.fftSize)
    let noise = 1

    const timer = setInterval(() => {
      if (!startedRef.current || recorderRef.current?.state !== 'recording') return
      // Created without a user gesture; after the user clicks Start, it can begin.
      if (context.state === 'suspended') void context.resume()

      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (const sample of data) sum += sample * sample
      const rms = Math.sqrt(sum / data.length)
      // Noise floor: follow the minimum and climb slowly if the environment becomes louder.
      noise = Math.min(rms, noise * 1.002)

      const now = performance.now()
      if (rms > Math.max(MIN_VOICE_RMS, noise * VOICE_OVER_NOISE)) {
        lastVoiceAtRef.current = now
        hadVoiceRef.current = true
        awaitingVoiceRef.current = false
        breakPendingRef.current = false
      } else if (hadVoiceRef.current && now - lastVoiceAtRef.current > SILENCE_MS) {
        breakPendingRef.current = true
      }
    }, 100)

    return () => {
      clearInterval(timer)
      void context.close()
    }
  }, [stream])

  const loadWhisper = () => {
    worker.current?.postMessage({ type: 'load' })
    setStatus('loading')
  }

  const start = () => {
    hadVoiceRef.current = false
    breakPendingRef.current = false
    startedRef.current = true
    setStarted(true)
    // Usually Whisper is already ready (or half) by preload; if failed, it is reintended.
    if (status === 'ready') startRecorder(recorderRef.current)
    else if (status === null) loadWhisper()
    warmTranslator(sourceLanguage, targetLanguage)
  }

  const changeSource = (lang: string) => {
    if (lang === sourceLanguage) return
    restartRecorder()
    setSourceLanguage(lang)
    warmTranslator(lang, targetLanguage)
  }

  const changeTarget = (lang: string) => {
    if (lang === targetLanguage) return
    setTargetLanguage(lang)
    warmTranslator(sourceLanguage, lang)
    if (text) requestTranslation(text, sourceLanguage, lang)
    for (const p of paragraphs) translateParagraph(p.id, p.source, sourceLanguage, lang)
  }

  const swap = () => {
    setSourceLanguage(targetLanguage)
    setTargetLanguage(sourceLanguage)
    resetTexts()
    warmTranslator(targetLanguage, sourceLanguage)
  }

  const toggleEngine = () => {
    if (!hasChromeTranslator) return
    const next: Engine = engineRef.current === 'chrome' ? 'local' : 'chrome'
    engineRef.current = next
    setEngine(next)
    warmTranslator(sourceLanguage, targetLanguage, next)
    if (text) requestTranslation(text, sourceLanguage, targetLanguage)
    for (const p of paragraphs) translateParagraph(p.id, p.source, sourceLanguage, targetLanguage)
  }

  // Status in the header of the page (outside React), like all other demos.
  const headerState = micError
    ? { state: 'error', label: 'no microphone' }
    : status === 'loading'
      ? { state: 'loading', label: 'loading' }
      : status === 'ready'
        ? recording
          ? { state: 'playing', label: 'escuchando' }
          : { state: 'paused', label: started ? 'paused' : 'ready' }
        : { state: 'paused', label: 'waiting' }

  useEffect(() => {
    const el = document.getElementById('status')
    if (!el) return
    el.dataset.state = headerState.state
    el.textContent = headerState.label
  }, [headerState.state, headerState.label])

  const totalBytes = progressItems.reduce((s, i) => s + (i.total || 0), 0)
  const loadedBytes = progressItems.reduce((s, i) => s + (i.loaded || 0), 0)
  const speed = progressItems.reduce((s, i) => s + (i.speed || 0), 0)
  const pct = totalBytes > 0 ? loadedBytes / totalBytes : 0

  useEffect(() => {
    const el = document.getElementById('progress')
    if (!el) return
    el.hidden = status !== 'loading'
    el.style.setProperty('--p', String(pct))
  }, [status, pct])

  // Chat Attacks: Clean L, I exchange languages, T changes translation engine.
  const shortcuts = useRef({ resetTexts, swap, toggleEngine })
  shortcuts.current = { resetTexts, swap, toggleEngine }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === 'l' || e.key === 'L') shortcuts.current.resetTexts()
      if (e.key === 'i' || e.key === 'I') shortcuts.current.swap()
      if (e.key === 't' || e.key === 'T') shortcuts.current.toggleEngine()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Without the status bar, the translator's preparation is seen in the translation slot.
  const pairLoad = sourceLanguage === targetLanguage ? undefined : loads[loadKey(engine, sourceLanguage, targetLanguage)]
  const shownLoad = pairLoad?.fallback ? loads[loadKey('local', sourceLanguage, targetLanguage)] : pairLoad
  const targetPlaceholder =
    pairLoad?.state === 'loading'
      ? `preparando traductor${shownLoad?.progress != null ? ` ${Math.round(shownLoad.progress * 100)}%` : '…'}`
      : 'And here, the translation'

  if (!hasWebGPU) {
    return (
      <div className="tr-alert" data-kind="error">
        <strong>WebGPU not available</strong>
        <p>Open the demo on Chrome or desktop Edge.</p>
      </div>
    )
  }

  const controls = (
    <div className="tr-controls">
      <LanguageSelect label="I speak" language={sourceLanguage} onChange={changeSource} />
      <span className="tr-arrow" aria-hidden="true">
        →
      </span>
      <LanguageSelect label="Translate into" language={targetLanguage} onChange={changeTarget} />
      <button type="button" className="tr-round" onClick={swap} aria-label="Intercambiar idiomas" title="I · intercambiar">
        ⇄
      </button>
      <button
        type="button"
        className="tr-round tr-clear"
        onClick={resetTexts}
        aria-label="Clear"
        title="L · limpiar"
        disabled={!started || status !== 'ready'}
      >
        L
      </button>
    </div>
  )

  return (
    <div className="tr">
      {headerSlot ? createPortal(controls, headerSlot) : controls}
      <div className="tr-stage">
        <AudioVisualizer stream={stream} active={recording && status === 'ready'} />
        {tps != null && <span className="tr-tps">{tps.toFixed(1)} tok/s</span>}

        {!started && (
          <div className="tr-overlay">
            <button type="button" className="tr-primary" onClick={start} disabled={!!micError}>
              empezar
            </button>
            <small>
              {status === 'ready'
                ? 'Whisper ready'
                : status === 'loading'
                  ? `loading Whisper${totalBytes > 0 ? ` · ${Math.round(pct * 100)}%` : '…'}`
                  : 'Whisper is downloaded once and cached'}
            </small>
          </div>
        )}

        {started && status === 'loading' && (
          <div className="tr-overlay">
            <p className="tr-loading">{loadingMessage || 'Loading model...'}</p>
            {totalBytes > 0 && (
              <small>
                {formatBytes(loadedBytes)} / {formatBytes(totalBytes)} · {Math.round(pct * 100)}%
                {speed > 0 && ` · ${formatBytes(speed)}/s`}
              </small>
            )}
          </div>
        )}
      </div>

      <div className="tr-subtitles" aria-live="polite">
        <Caption className="tr-source">
          {paragraphs.map((p) => (
            <p key={p.id}>{p.source}</p>
          ))}
          {text ? (
            <p>{text}</p>
          ) : (
            paragraphs.length === 0 && (
              <p data-empty="true">
                {started && status === 'ready' ? 'speak and it will appear here…' : 'here is the transcript'}
              </p>
            )
          )}
        </Caption>
        <Caption className="tr-target">
          {paragraphs.map((p) => (
            <p key={p.id}>{p.target}</p>
          ))}
          {translatedText ? <p>{translatedText}</p> : paragraphs.length === 0 && <p data-empty="true">{targetPlaceholder}</p>}
        </Caption>
      </div>

      {pairLoad?.state === 'error' && (
        <div className="tr-alert">Could not load translator. Check connection and choose language again.</div>
      )}
      {micError && <div className="tr-alert" data-kind="error">{micError}</div>}
    </div>
  )
}
