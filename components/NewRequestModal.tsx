"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AddContextPanel } from "@/components/AddContextPanel"
import { SourceBadge } from "@/components/FindingCard"
import { useApp } from "@/components/Providers"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import type { FindingMatch } from "@/lib/rag"
import { api, AREAS, errorMessage } from "@/lib/utils"

interface SearchResponse {
  results: FindingMatch[]
  timing: { embed_ms: number; search_ms: number }
  close: number
}

type Preview =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "done"; data: SearchResponse }
  | { state: "error"; message: string }

const MIN_QUESTION = 12

export function NewRequestModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { member, selectedContext } = useApp()
  const [question, setQuestion] = useState("")
  const [reason, setReason] = useState("")
  const [belief, setBelief] = useState("")
  const [area, setArea] = useState<string>(AREAS[0])
  const [context, setContext] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview>({ state: "idle" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Context pills start from the workspace selection made on the home sidebar.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setContext(selectedContext)
      setError(null)
    }
  }

  // Live pgvector preview: check the Library as the question is typed.
  const trimmed = question.trim()
  useEffect(() => {
    if (!open || trimmed.length < MIN_QUESTION) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setPreview({ state: "checking" })
      try {
        const data = await api<SearchResponse>("/api/library/search", {
          body: { query: trimmed, limit: 3 },
          signal: controller.signal,
        })
        setPreview({ state: "done", data })
      } catch (err) {
        if (!controller.signal.aborted) setPreview({ state: "error", message: errorMessage(err) })
      }
    }, 500)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, trimmed])

  const create = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await api<{ id: string }>("/api/requests", {
        body: { question: trimmed, reason: reason.trim(), belief: belief.trim(), area, context_areas: context },
      })
      toast.add({ title: `${res.id} created`, description: "Next: choose who to talk to.", type: "success" })
      onOpenChange(false)
      setQuestion("")
      setReason("")
      setBelief("")
      setPreview({ state: "idle" })
      router.push(`/requests/${res.id}/people`)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const showPreview = trimmed.length >= MIN_QUESTION ? preview : ({ state: "idle" } as Preview)

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-6 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">
            Start a <span className="rl-serif text-[1.1em]">research request</span>
          </DialogTitle>
          <DialogDescription>
            One question, one owner. The Library is checked as you type so we don&apos;t ask customers twice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <label className="rl-label" htmlFor="nr-question">
                Question
              </label>
              <textarea
                id="nr-question"
                className="rl-input min-h-20"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What do you want to learn from customers?"
              />
              <div className="rl-card-inset mt-2 p-3" aria-live="polite">
                {showPreview.state === "idle" && (
                  <p className="rl-mono">Library preview · type a question to check past findings</p>
                )}
                {showPreview.state === "checking" && (
                  <p className="rl-mono flex items-center gap-2">
                    <span className="rl-live-dot" /> Checking Library…
                  </p>
                )}
                {showPreview.state === "error" && (
                  <p className="rl-hint">The Library couldn&apos;t be checked: {showPreview.message}</p>
                )}
                {showPreview.state === "done" && (
                  <>
                    <p className="rl-mono">
                      Library checked · pgvector {showPreview.data.timing.search_ms}ms · embed{" "}
                      {showPreview.data.timing.embed_ms}ms
                    </p>
                    {showPreview.data.results.filter((r) => r.similarity >= showPreview.data.close).length === 0 ? (
                      <p className="rl-hint mt-2">
                        Nothing in the Library is close to this. It looks like a new question.
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {showPreview.data.results
                          .filter((r) => r.similarity >= showPreview.data.close)
                          .map((r) => (
                            <li key={r.id} className="text-sm text-ink">
                              <span className="rl-mono mr-2 text-accent-2">{Math.round(r.similarity * 100)}%</span>
                              {r.text}
                              <span className="ml-2 inline-flex align-middle">
                                <SourceBadge kind={r.source_kind} />
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="rl-label" htmlFor="nr-reason">
                Why now
              </label>
              <textarea
                id="nr-reason"
                className="rl-input min-h-14"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What decision is waiting on this?"
              />
            </div>

            <div>
              <label className="rl-label" htmlFor="nr-belief">
                What we believe today
              </label>
              <textarea
                id="nr-belief"
                className="rl-input min-h-14"
                value={belief}
                onChange={(e) => setBelief(e.target.value)}
                placeholder="Write the hunch down so it can be checked, not assumed."
              />
            </div>

            <div>
              <label className="rl-label" htmlFor="nr-area">
                Product area
              </label>
              <select id="nr-area" className="rl-input" value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <AddContextPanel value={context} onChange={setContext} />
        </div>

        {!member.canOwn && (
          <p className="rl-hint">
            {member.name} can&apos;t own a research request. Switch to Anita, Priya or Dev to create one.
          </p>
        )}
        {error && <p className="text-sm font-medium text-ink">Couldn&apos;t create the request: {error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rl-hint mr-auto">Owner: {member.name}</span>
          <button type="button" className="rl-btn rl-btn-ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="rl-btn rl-btn-primary"
            disabled={saving || !member.canOwn || trimmed.length < MIN_QUESTION}
            onClick={create}
          >
            {saving ? "Creating…" : "Create & go to People →"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
