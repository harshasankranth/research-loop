"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChatInput, ChatThread } from "@/components/ChatInput"
import { useApp } from "@/components/Providers"
import { useGeminiLive } from "@/components/voice/useGeminiLive"

const BARS = 28

function Waveform({ getLevels, active }: { getLevels: (bars: number) => number[]; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const levels = active ? getLevels(BARS) : []
      const bars = ref.current?.children
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          const level = levels[i] ?? 0
          ;(bars[i] as HTMLElement).style.height = `${Math.max(6, Math.round(level * 100))}%`
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [getLevels, active])

  return (
    <div ref={ref} aria-hidden className="flex h-20 items-center justify-center gap-[3px]">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="w-[5px] rounded-full bg-accent" style={{ height: "6%" }} />
      ))}
    </div>
  )
}

/**
 * Voice call overlay, available from every page. The page stays visible behind
 * it so navigation triggered by the assistant can be seen. If the live voice
 * connection fails, it switches to text chat with the same tools (brief rule 18).
 */
export function VoiceCallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { chat, member } = useApp()
  const [textMode, setTextMode] = useState(false)
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)

  const live = useGeminiLive({
    onFallback: (reason) => {
      setFallbackReason(reason)
      setTextMode(true)
    },
  })
  const { connect, disconnect } = live

  useEffect(() => {
    if (!open) return
    setTextMode(false)
    setFallbackReason(null)
    void connect()
    return () => disconnect()
  }, [open, connect, disconnect])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const stateLabel =
    live.status === "connecting"
      ? "Connecting…"
      : live.speaking
        ? "Speaking"
        : live.muted
          ? "Muted"
          : live.listening
            ? "Listening"
            : "Call ended"

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-6 sm:justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-label="Call with AI"
            className="rl-card pointer-events-auto flex max-h-[80dvh] w-full max-w-[420px] flex-col gap-4 overflow-hidden bg-surface p-5"
            style={{ boxShadow: "var(--shadow)" }}
            initial={{ y: 24, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2">
              <h2 className="rl-h2">
                Call with <span className="rl-serif text-[1.15em]">AI</span>
              </h2>
              {!textMode && (
                <span className="rl-tag ml-auto" data-tone={live.status === "live" ? "accent" : undefined}>
                  {live.status === "live" && <span className="rl-live-dot" />} {stateLabel}
                </span>
              )}
              {textMode && <span className="rl-tag ml-auto">Text mode</span>}
            </div>

            {textMode ? (
              <>
                <p className="rl-card-inset p-3 text-sm text-ink">
                  {fallbackReason ?? "Voice isn't available."} Switched to text — the same tools work here.
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ChatThread messages={chat.messages} busy={chat.busy} />
                </div>
                <ChatInput onSend={chat.send} busy={chat.busy} autoFocus placeholder="Type to the assistant…" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rl-btn rl-btn-sm"
                    onClick={() => {
                      setTextMode(false)
                      setFallbackReason(null)
                      void connect()
                    }}
                  >
                    Try voice again
                  </button>
                  <button type="button" className="rl-btn rl-btn-ghost rl-btn-sm ml-auto" onClick={onClose}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <Waveform getLevels={live.getLevels} active={live.status === "live"} />

                <div className="flex min-h-24 flex-col gap-2" aria-live="polite">
                  <p className="text-sm text-ink-2">
                    <span className="rl-mono mr-2">{member.name}</span>
                    {live.interimTranscript ||
                      (live.status === "live" ? "Try: “What's the state of R-003?”" : "Waiting for the microphone…")}
                  </p>
                  {live.lastReply && (
                    <p className="text-sm text-ink">
                      <span className="rl-mono mr-2 text-accent-2">Assistant</span>
                      {live.lastReply}
                    </p>
                  )}
                </div>

                <p className="rl-mono">Audio goes browser → Gemini Live. Nothing is recorded or stored.</p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rl-btn"
                    aria-pressed={live.muted}
                    disabled={live.status !== "live"}
                    onClick={() => live.setMuted(!live.muted)}
                  >
                    {live.muted ? "Unmute" : "Mute"}
                  </button>
                  <button type="button" className="rl-btn rl-btn-primary ml-auto" onClick={onClose}>
                    End call
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
