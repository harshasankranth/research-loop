"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AddContextPanel } from "@/components/AddContextPanel"
import { FindingCard } from "@/components/FindingCard"
import { AiDraftChip, ShowThinking } from "@/components/ShowThinking"
import { StepFooter } from "@/components/WorkspaceBits"
import { toast } from "@/components/ui/toast"
import type { AiMeta } from "@/lib/ai"
import type { RequestDTO } from "@/lib/db"
import type { FindingMatch } from "@/lib/rag"
import { api, errorMessage } from "@/lib/utils"

interface Hint {
  verdict: "clear" | "sharpen"
  note: string
  ai: AiMeta
}

interface SearchResponse {
  results: FindingMatch[]
  timing: { embed_ms: number; search_ms: number }
  close: number
  weak: number
}

type Loadable<T> = { state: "idle" } | { state: "loading" } | { state: "done"; data: T } | { state: "error"; message: string }

export function QuestionStep({ request }: { request: RequestDTO }) {
  const router = useRouter()
  const locked = request.status === "closed" || request.status === "reused"
  const [question, setQuestion] = useState(request.question)
  const [reason, setReason] = useState(request.reason ?? "")
  const [belief, setBelief] = useState(request.belief ?? "")
  const [context, setContext] = useState(request.context_areas)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<Loadable<Hint>>({ state: "idle" })
  const [matches, setMatches] = useState<Loadable<SearchResponse>>({ state: "idle" })

  const trimmed = question.trim()
  const contextKey = context.join("|")

  // Live sharpen hint (Gemini) — advice only, it never rewrites the question.
  useEffect(() => {
    if (locked || trimmed.length < 12) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setHint({ state: "loading" })
      try {
        const data = await api<Hint>("/api/ai/question-sharpen", {
          body: { question: trimmed, contextAreas: contextKey ? contextKey.split("|") : [], request_id: request.id },
          signal: controller.signal,
        })
        setHint({ state: "done", data })
      } catch (err) {
        if (!controller.signal.aborted) setHint({ state: "error", message: errorMessage(err) })
      }
    }, 900)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, contextKey, locked, request.id])

  // RAG preview: past findings close to this question.
  useEffect(() => {
    if (trimmed.length < 12) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setMatches({ state: "loading" })
      try {
        const data = await api<SearchResponse>("/api/library/search", {
          body: { query: trimmed, limit: 4 },
          signal: controller.signal,
        })
        setMatches({ state: "done", data })
      } catch (err) {
        if (!controller.signal.aborted) setMatches({ state: "error", message: errorMessage(err) })
      }
    }, 500)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  const dirty =
    trimmed !== request.question ||
    reason.trim() !== (request.reason ?? "") ||
    belief.trim() !== (request.belief ?? "") ||
    contextKey !== request.context_areas.join("|")

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api(`/api/requests/${request.id}`, {
        method: "PATCH",
        body: { op: "update", question: trimmed, reason: reason.trim(), belief: belief.trim(), context_areas: context },
      })
      toast.add({ title: "Question saved", type: "success" })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const shownMatches =
    matches.state === "done" ? matches.data.results.filter((r) => r.similarity >= matches.data.weak) : []

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-5">
          <div>
            <label className="rl-label" htmlFor="q-question">
              The question
            </label>
            <textarea
              id="q-question"
              className="rl-input min-h-20 text-base"
              value={question}
              disabled={locked}
              onChange={(e) => setQuestion(e.target.value)}
            />
            {!locked && (
              <div className="rl-card-inset mt-2 flex flex-col gap-2 p-3" aria-live="polite">
                {hint.state === "idle" && <p className="rl-mono">Sharpen hint · appears as you edit the question</p>}
                {hint.state === "loading" && (
                  <p className="rl-mono flex items-center gap-2">
                    <span className="rl-live-dot" /> Reading the question…
                  </p>
                )}
                {hint.state === "error" && <p className="rl-hint">No hint: {hint.message}</p>}
                {hint.state === "done" && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rl-tag" data-tone="strong">
                        {hint.data.verdict === "clear" ? "Reads clear" : "Could be sharper"}
                      </span>
                      <AiDraftChip label="AI hint — you decide" />
                    </div>
                    <p className="text-sm text-ink">{hint.data.note}</p>
                    <ShowThinking meta={hint.data.ai} inputs={["The question as typed", "Selected context areas"]} />
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="rl-label" htmlFor="q-reason">
              Why now
            </label>
            <textarea
              id="q-reason"
              className="rl-input min-h-16"
              value={reason}
              disabled={locked}
              placeholder="What decision is waiting on this?"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div>
            <label className="rl-label" htmlFor="q-belief">
              What we believe today
            </label>
            <textarea
              id="q-belief"
              className="rl-input min-h-16"
              value={belief}
              disabled={locked}
              placeholder="Write the hunch down so it can be checked, not assumed."
              onChange={(e) => setBelief(e.target.value)}
            />
          </div>

          {!locked && (
            <div className="rl-card p-5">
              <AddContextPanel value={context} onChange={setContext} title="Context for this request" />
            </div>
          )}
          {locked && request.context_areas.length > 0 && (
            <p className="rl-hint">Context areas: {request.context_areas.join(", ")}</p>
          )}

          {error && <p className="text-sm font-medium text-ink">Couldn&apos;t save: {error}</p>}
          {!locked && (
            <div>
              <button type="button" className="rl-btn" disabled={saving || !dirty || trimmed.length < 12} onClick={save}>
                {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
            </div>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          <h2 className="rl-h2">Already in the Library</h2>
          {matches.state === "idle" && <p className="rl-hint">Past findings close to this question show up here.</p>}
          {matches.state === "loading" && (
            <p className="rl-mono flex items-center gap-2">
              <span className="rl-live-dot" /> Checking Library…
            </p>
          )}
          {matches.state === "error" && <p className="rl-hint">The Library couldn&apos;t be checked: {matches.message}</p>}
          {matches.state === "done" && (
            <>
              <p className="rl-mono">
                pgvector {matches.data.timing.search_ms}ms · embed {matches.data.timing.embed_ms}ms
              </p>
              {shownMatches.length === 0 ? (
                <p className="rl-hint">Nothing in the Library is close to this question.</p>
              ) : (
                shownMatches.map((m) => (
                  <FindingCard
                    key={m.id}
                    finding={m}
                    similarity={{ value: m.similarity, weak: m.similarity < matches.data.close }}
                  />
                ))
              )}
            </>
          )}
        </aside>
      </div>

      <StepFooter
        requestId={request.id}
        step="question"
        currentStep={request.current_step}
        locked={locked}
        blocked={dirty && !locked ? "Save your changes before moving on." : null}
      />
    </div>
  )
}
