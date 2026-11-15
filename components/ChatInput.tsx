"use client"

import { useEffect, useRef, useState } from "react"
import { AiDraftChip, ShowThinking } from "@/components/ShowThinking"
import type { ChatMessage } from "@/components/voice/useTextChat"
import { cn } from "@/lib/utils"

export function ChatInput({
  onSend,
  onVoice,
  busy = false,
  size = "md",
  placeholder = "Ask a question…",
  autoFocus = false,
}: {
  onSend: (text: string) => void | Promise<void>
  onVoice?: () => void
  busy?: boolean
  size?: "md" | "lg"
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState("")

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    setText("")
    void onSend(value)
  }

  return (
    <form
      className={cn(
        "rl-card flex flex-col gap-2 transition-colors focus-within:border-accent",
        size === "lg" ? "p-4" : "p-3"
      )}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        value={text}
        autoFocus={autoFocus}
        rows={size === "lg" ? 3 : 1}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "w-full resize-none bg-transparent text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none",
          size === "lg" ? "text-base" : "text-sm"
        )}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex items-center gap-2">
        <span className="rl-mono hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
        <div className="ml-auto flex items-center gap-2">
          {onVoice && (
            <button type="button" className="rl-btn rl-btn-sm" onClick={onVoice}>
              <span aria-hidden>🎙</span> Call with AI
            </button>
          )}
          <button type="submit" className="rl-btn rl-btn-primary rl-btn-sm" disabled={busy || !text.trim()}>
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </form>
  )
}

export function ChatThread({
  messages,
  busy,
  className,
}: {
  messages: ChatMessage[]
  busy: boolean
  className?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length, busy])

  if (messages.length === 0 && !busy) return null

  return (
    <div className={cn("flex flex-col gap-3", className)} aria-live="polite">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="ml-auto max-w-[85%] rounded-[14px] bg-surface-2 px-4 py-2.5 text-sm text-ink">
            {m.text}
          </div>
        ) : (
          <div key={m.id} className="rl-card max-w-[92%] p-4">
            {m.tools && m.tools.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {m.tools.map((t, i) => (
                  <span key={`${t.name}-${i}`} className="rl-tag" title={JSON.stringify(t.args)}>
                    {t.ok ? "✓" : "✕"} {t.name}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm whitespace-pre-wrap text-ink">{m.text}</p>
            {!m.failed && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <AiDraftChip />
                <ShowThinking meta={m.meta} className="w-full" />
              </div>
            )}
          </div>
        )
      )}
      {busy && (
        <p className="rl-mono flex items-center gap-2">
          <span className="rl-live-dot" /> Thinking…
        </p>
      )}
      <div ref={endRef} />
    </div>
  )
}
