"use client"

// Small client pieces shared by the request workspace pages.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useApp } from "@/components/Providers"
import { api, errorMessage, STEP_LABEL, STEPS, type Step } from "@/lib/utils"

/** Persistent bottom bar: "Chat with data in R-003 (⌘J)". */
export function ChatBar({ requestId }: { requestId: string }) {
  const { openPalette } = useApp()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-6">
      <button
        type="button"
        onClick={() => openPalette("chat")}
        className="rl-card pointer-events-auto flex h-12 w-full max-w-[640px] items-center gap-3 bg-surface px-4 text-left text-sm text-ink-2 transition-colors hover:border-line-2"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <span className="rl-live-dot" />
        Chat with data in {requestId}
        <kbd className="rl-mono ml-auto">⌘J</kbd>
      </button>
    </div>
  )
}

/** "Continue to …" — moves the request's current step forward, then navigates. */
export function StepFooter({
  requestId,
  step,
  currentStep,
  locked,
  blocked,
}: {
  requestId: string
  step: Step
  currentStep: Step
  locked: boolean
  /** Reason the next step isn't available yet. */
  blocked?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = STEPS[STEPS.indexOf(step) + 1]
  if (!next) return null

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      // Only ever move the marker forward.
      if (!locked && STEPS.indexOf(next) > STEPS.indexOf(currentStep)) {
        await api(`/api/requests/${requestId}`, { method: "PATCH", body: { op: "update", current_step: next } })
      }
      router.push(`/requests/${requestId}/${next}`)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
      {(blocked || error) && <p className="rl-hint mr-auto">{error ?? blocked}</p>}
      <button type="button" className="rl-btn rl-btn-primary" disabled={busy || Boolean(blocked)} onClick={go}>
        Continue to {STEP_LABEL[next]} →
      </button>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rl-card p-6">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="rl-hint mt-1">{children}</div>}
    </div>
  )
}
