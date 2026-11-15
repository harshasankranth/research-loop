"use client"

// Text chat with the same assistant and the same five tools as the voice call.
// Used by the home chat box, the ⌘K palette and the voice modal's text fallback.
import { useCallback, useMemo, useRef, useState } from "react"
import { runTool } from "@/components/voice/tools"
import type { AiMeta } from "@/lib/ai"
import { api, errorMessage } from "@/lib/utils"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  meta?: AiMeta
  tools?: { name: string; args: Record<string, unknown>; ok: boolean }[]
  failed?: boolean
}

export interface TextChat {
  messages: ChatMessage[]
  busy: boolean
  send: (text: string) => Promise<void>
  reset: () => void
}

interface ChatResponse {
  text: string
  functionCalls: { id?: string; name: string; args: Record<string, unknown> }[]
  modelContent: unknown
  ai: AiMeta
}

const MAX_TOOL_ROUNDS = 5
let counter = 0
const nextId = () => `m${Date.now()}-${++counter}`

export function useTextChat(getContext: () => { path: string; context_areas: string[] }): TextChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  // Full Gemini history (including tool turns), kept out of render state.
  const history = useRef<unknown[]>([])
  const busyRef = useRef(false)
  const contextRef = useRef(getContext)
  contextRef.current = getContext

  const send = useCallback(async (text: string) => {
    const value = text.trim()
    if (!value || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessages((m) => [...m, { id: nextId(), role: "user", text: value }])
    const turnStart = history.current.length
    history.current.push({ role: "user", parts: [{ text: value }] })
    const tools: NonNullable<ChatMessage["tools"]> = []
    try {
      for (let round = 0; ; round++) {
        const res = await api<ChatResponse>("/api/chat", {
          body: { contents: history.current, context: contextRef.current() },
        })
        if (res.modelContent) history.current.push(res.modelContent)
        if (res.functionCalls.length === 0 || round >= MAX_TOOL_ROUNDS) {
          setMessages((m) => [
            ...m,
            {
              id: nextId(),
              role: "assistant",
              text: res.text || "I don't have an answer for that.",
              meta: res.ai,
              tools,
            },
          ])
          break
        }
        const parts = []
        for (const call of res.functionCalls) {
          const { ok, result } = await runTool(call.name, call.args)
          tools.push({ name: call.name, args: call.args, ok })
          parts.push({ functionResponse: { id: call.id, name: call.name, response: { result } } })
        }
        history.current.push({ role: "user", parts })
      }
    } catch (err) {
      // Drop the half-finished turn so the next message starts from a valid history.
      history.current.length = turnStart
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text: errorMessage(err), failed: true, tools }])
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const reset = useCallback(() => {
    history.current = []
    setMessages([])
  }, [])

  return useMemo(() => ({ messages, busy, send, reset }), [messages, busy, send, reset])
}
