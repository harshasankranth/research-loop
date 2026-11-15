"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { RequestStatus } from "@/lib/schema"
import { cn, STEP_LABEL, STEPS, type Step } from "@/lib/utils"

export function StatusTag({ status }: { status: RequestStatus }) {
  if (status === "open") {
    return (
      <span className="rl-tag" data-tone="accent">
        <span className="rl-live-dot" /> Open
      </span>
    )
  }
  return <span className="rl-tag">{status}</span>
}

/** Question → People → Talk → Capture → Decide. */
export function RequestStepper({
  requestId,
  currentStep,
  status,
}: {
  requestId: string
  currentStep: Step
  status: RequestStatus
}) {
  const pathname = usePathname()
  const reached = status === "closed" || status === "reused" ? STEPS.length : STEPS.indexOf(currentStep)

  return (
    <nav aria-label="Request steps" className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((step, i) => {
        const viewing = pathname.endsWith(`/${step}`)
        const done = i < reached
        const isCurrent = i === reached
        return (
          <div key={step} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="h-px w-5 bg-line-2" />}
            <Link
              href={`/requests/${requestId}/${step}`}
              aria-current={viewing ? "step" : undefined}
              data-selected={viewing}
              className={cn("rl-pill h-9 gap-2 px-3.5", !viewing && !done && !isCurrent && "text-ink-3")}
            >
              <span className="rl-mono text-[10px]">{done ? "✓" : `0${i + 1}`}</span>
              {STEP_LABEL[step]}
              {isCurrent && <span className="rl-live-dot" title="Current step" />}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}

/** Data / Docs tabs, Dovetail-style. */
export function WorkspaceTabs({ requestId, currentStep }: { requestId: string; currentStep: Step }) {
  const pathname = usePathname()
  const onDocs = pathname.endsWith("/docs")
  const tab = "border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors"
  return (
    <div className="flex gap-6 border-b border-line" role="tablist" aria-label="Workspace">
      <Link
        href={`/requests/${requestId}/${currentStep}`}
        role="tab"
        aria-selected={!onDocs}
        className={cn(tab, !onDocs ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink")}
      >
        Data
      </Link>
      <Link
        href={`/requests/${requestId}/docs`}
        role="tab"
        aria-selected={onDocs}
        className={cn(tab, onDocs ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink")}
      >
        Docs
      </Link>
    </div>
  )
}
