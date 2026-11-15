"use client"

// Gemini Live voice session: browser ↔ Gemini directly over WebSocket, authorised
// by a single-use ephemeral token from /api/voice/token (brief §13).
import { useCallback, useEffect, useRef, useState } from "react"
import { runTool, toGeminiSchema, TOOLS } from "@/components/voice/tools"
import { voiceSystem } from "@/lib/prompts"
import { api, errorMessage } from "@/lib/utils"

const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025"
const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained"
// The worklet decimates by 3, so the capture context must run at 48 kHz to give 16 kHz PCM.
const CONTEXT_RATE = 48000
const OUTPUT_RATE = 24000

export type LiveStatus = "idle" | "connecting" | "live" | "ended"

interface FunctionCall {
  id?: string
  name: string
  args?: Record<string, unknown>
}

interface ServerMessage {
  setupComplete?: unknown
  toolCall?: { functionCalls?: FunctionCall[] }
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] }
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
    interrupted?: boolean
    turnComplete?: boolean
  }
  goAway?: unknown
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(data: string): Int16Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))
}

export function useGeminiLive({ onFallback }: { onFallback: (reason: string) => void }) {
  const [status, setStatus] = useState<LiveStatus>("idle")
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [lastReply, setLastReply] = useState("")
  const [error, setError] = useState<string | null>(null)

  const ws = useRef<WebSocket | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const sources = useRef(new Set<AudioBufferSourceNode>())
  const playHead = useRef(0)
  const mutedRef = useRef(false)
  const session = useRef(0)
  const replyBuffer = useRef("")
  const heardBuffer = useRef("")
  const turnDone = useRef(true)
  const fallbackRef = useRef(onFallback)
  fallbackRef.current = onFallback

  const stopPlayback = useCallback(() => {
    sources.current.forEach((s) => {
      try {
        s.stop()
      } catch {
        // already stopped
      }
    })
    sources.current.clear()
    playHead.current = 0
    setSpeaking(false)
  }, [])

  const teardown = useCallback(() => {
    session.current += 1
    stopPlayback()
    const socket = ws.current
    ws.current = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      try {
        socket.close()
      } catch {
        // already closed
      }
    }
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    analyser.current = null
    const audio = ctx.current
    ctx.current = null
    if (audio && audio.state !== "closed") void audio.close().catch(() => {})
    setListening(false)
  }, [stopPlayback])

  const disconnect = useCallback(() => {
    teardown()
    setStatus("ended")
  }, [teardown])

  // Any failure: clean disconnect, then hand over to text chat.
  const fail = useCallback(
    (reason: string) => {
      teardown()
      setError(reason)
      setStatus("ended")
      fallbackRef.current(reason)
    },
    [teardown]
  )

  const play = useCallback((pcm: Int16Array) => {
    const audio = ctx.current
    if (!audio || pcm.length === 0) return
    const buffer = audio.createBuffer(1, pcm.length, OUTPUT_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000
    const source = audio.createBufferSource()
    source.buffer = buffer
    if (analyser.current) source.connect(analyser.current)
    source.connect(audio.destination)
    const at = Math.max(audio.currentTime + 0.02, playHead.current)
    source.start(at)
    playHead.current = at + buffer.duration
    sources.current.add(source)
    setSpeaking(true)
    source.onended = () => {
      sources.current.delete(source)
      if (sources.current.size === 0) setSpeaking(false)
    }
  }, [])

  const connect = useCallback(async () => {
    teardown()
    const mine = session.current
    const stale = () => session.current !== mine
    setError(null)
    setInterimTranscript("")
    setLastReply("")
    replyBuffer.current = ""
    heardBuffer.current = ""
    turnDone.current = true
    setStatus("connecting")

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
        throw new Error("This browser can't capture microphone audio.")
      }
      // 1. Ephemeral token (the API key never reaches the browser).
      // The request list goes into the system prompt, read fresh for this call.
      const [{ token }, live] = await Promise.all([
        api<{ token: string }>("/api/voice/token", { method: "POST" }),
        api<{ requests: { id: string; area: string | null; status: string; current_step: string }[] }>("/api/requests")
          .then((r) => r.requests)
          .catch(() => null),
      ])
      const systemText = voiceSystem(live)
      if (stale()) return

      // 2. Microphone + audio graph.
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (stale()) {
        media.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = media
      const audio = new AudioContext({ sampleRate: CONTEXT_RATE })
      ctx.current = audio
      await audio.resume()
      await audio.audioWorklet.addModule("/voice/pcm-processor.js")
      if (stale()) return
      const mic = audio.createMediaStreamSource(media)
      const worklet = new AudioWorkletNode(audio, "pcm-processor")
      const meter = audio.createAnalyser()
      meter.fftSize = 256
      analyser.current = meter
      mic.connect(meter)
      mic.connect(worklet)

      // 3. WebSocket straight to Gemini Live.
      const socket = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`)
      ws.current = socket
      let ready = false

      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!ready || mutedRef.current || socket.readyState !== WebSocket.OPEN) return
        socket.send(
          JSON.stringify({ realtimeInput: { audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } } })
        )
      }

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${MODEL}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: systemText }] },
              tools: [{ functionDeclarations: toGeminiSchema(TOOLS) }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          })
        )
      }

      socket.onmessage = async (event: MessageEvent) => {
        let msg: ServerMessage
        try {
          const raw = typeof event.data === "string" ? event.data : await new Response(event.data as Blob).text()
          msg = JSON.parse(raw) as ServerMessage
        } catch {
          return
        }
        if (stale()) return

        if (msg.setupComplete) {
          ready = true
          setStatus("live")
          setListening(!mutedRef.current)
          return
        }

        if (msg.toolCall?.functionCalls?.length) {
          const functionResponses = []
          for (const call of msg.toolCall.functionCalls) {
            const { result } = await runTool(call.name, call.args ?? {})
            functionResponses.push({ id: call.id, name: call.name, response: { result } })
          }
          if (!stale() && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ toolResponse: { functionResponses } }))
          }
          return
        }

        const content = msg.serverContent
        if (!content) return
        if (content.interrupted) stopPlayback()
        if (content.inputTranscription?.text) {
          heardBuffer.current += content.inputTranscription.text
          setInterimTranscript(heardBuffer.current.trim())
        }
        if (content.outputTranscription?.text) {
          if (turnDone.current) {
            // New reply: start a fresh line and clear what the user said before it.
            turnDone.current = false
            replyBuffer.current = ""
            heardBuffer.current = ""
          }
          replyBuffer.current += content.outputTranscription.text
          setLastReply(replyBuffer.current.trim())
        }
        for (const part of content.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) play(fromBase64(part.inlineData.data))
        }
        if (content.turnComplete) turnDone.current = true
      }

      socket.onerror = () => {
        if (!stale()) fail("The voice connection to Gemini failed.")
      }
      socket.onclose = (event: CloseEvent) => {
        if (stale()) return
        fail(
          ready
            ? `The voice call ended unexpectedly${event.reason ? ` (${event.reason.slice(0, 120)})` : ""}.`
            : "Gemini Live didn't accept the voice connection."
        )
      }
    } catch (err) {
      if (stale()) return
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "NotFoundError")
      fail(denied ? "The microphone isn't available or permission was denied." : errorMessage(err))
    }
  }, [teardown, fail, play, stopPlayback])

  const setMuted = useCallback((next: boolean) => {
    mutedRef.current = next
    setMutedState(next)
    stream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
    setListening(!next && ws.current?.readyState === WebSocket.OPEN)
  }, [])

  /** Current audio level 0–1 (mic and assistant voice), for the waveform. */
  const getLevels = useCallback((bars: number): number[] => {
    const node = analyser.current
    if (!node) return new Array<number>(bars).fill(0)
    const data = new Uint8Array(node.frequencyBinCount)
    node.getByteFrequencyData(data)
    const usable = Math.floor(data.length * 0.6)
    const size = Math.max(1, Math.floor(usable / bars))
    const out: number[] = []
    for (let b = 0; b < bars; b++) {
      let sum = 0
      for (let i = 0; i < size; i++) sum += data[b * size + i] ?? 0
      out.push(sum / size / 255)
    }
    return out
  }, [])

  useEffect(() => teardown, [teardown])

  return {
    connect,
    disconnect,
    speaking,
    listening,
    interimTranscript,
    lastReply,
    error,
    status,
    muted,
    setMuted,
    getLevels,
  }
}
