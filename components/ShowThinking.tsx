"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { AiMeta } from "@/lib/ai"
import { cn } from "@/lib/utils"

/** The chip every AI output carries (brief rule 4). */
export function AiDraftChip({ label = "AI draft — review before saving" }: { label?: string }) {
  return (
    <span className="rl-tag" data-tone="accent">
      {label}
    </span>
  )
}

/**
 * Collapsible "Show thinking" panel: Gemini's own thought summary, what went
 * into the call, and the model / latency / token counts from the audit log.
 */
export function ShowThinking({
  meta,
  inputs,
  className,
}: {
  meta: AiMeta | null | undefined
  /** Plain-language list of what the model was given. */
  inputs?: string[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (!meta) return null

  return (
    <div className={cn("text-sm", className)}>
      <button
        type="button"
        className="rl-mono inline-flex items-center gap-1.5 hover:text-ink"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className={cn("inline-block transition-transform", open && "rotate-90")}>
          ›
        </span>
        {open ? "Hide thinking" : "Show thinking"}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="rl-card-inset mt-2 flex flex-col gap-3 p-4">
              {inputs && inputs.length > 0 && (
                <div>
                  <p className="rl-mono mb-1">What went in</p>
                  <ul className="list-disc pl-5 text-ink-2">
                    {inputs.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="rl-mono mb-1">Model thinking</p>
                {meta.thinking ? (
                  <p className="whitespace-pre-wrap text-ink-2">{meta.thinking}</p>
                ) : (
                  <p className="text-ink-2">Gemini returned no thinking summary for this output.</p>
                )}
              </div>
              <p className="rl-mono">
                {meta.model} · {meta.latency_ms}ms · {meta.tokens.total} tokens
                {meta.tokens.thoughts ? ` (${meta.tokens.thoughts} thinking)` : ""}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
