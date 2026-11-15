"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { EchoNote, FindingCard } from "@/components/FindingCard"
import { NoteCard } from "@/components/NoteCard"
import { AiDraftChip, ShowThinking } from "@/components/ShowThinking"
import { TranscriptPaste } from "@/components/TranscriptPaste"
import { EmptyState, StepFooter } from "@/components/WorkspaceBits"
import { toast } from "@/components/ui/toast"
import type { AiMeta } from "@/lib/ai"
import type { FindingDTO, FindingRef, NoteDTO, PersonDTO, RequestDTO } from "@/lib/db"
import { api, cn, errorMessage } from "@/lib/utils"

interface DraftFinding {
  text: string
  limits: string
  linked_note_ids: string[]
  linked_people: string[]
  echoes: FindingRef | null
  similar_saved: { id: string; text: string; similarity: number } | null
}

interface SuggestResponse {
  findings: DraftFinding[]
  dropped_unlinked: number
  rag: { matches: { id: string; text: string; similarity: number }[]; embed_ms: number; search_ms: number }
  notes_used: number
  ai: AiMeta
}

export function CaptureStep({
  request,
  people,
  notes,
  findings,
}: {
  request: RequestDTO
  people: PersonDTO[]
  notes: NoteDTO[]
  findings: FindingDTO[]
}) {
  const router = useRouter()
  const locked = request.status === "closed" || request.status === "reused"
  const [tab, setTab] = useState<"notes" | "findings">("notes")
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState<number | null>(null)

  const suggest = async () => {
    setSuggesting(true)
    setMessage(null)
    setSuggestion(null)
    try {
      const res = await api<SuggestResponse>("/api/ai/suggest-findings", { body: { request_id: request.id } })
      setSuggestion(res)
      if (res.findings.length === 0) {
        setMessage("Gemini didn't find anything these notes could support, so it drafted no findings.")
      }
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setSuggesting(false)
    }
  }

  const patchDraft = (index: number, patch: Partial<DraftFinding>) =>
    setSuggestion((s) => (s ? { ...s, findings: s.findings.map((f, i) => (i === index ? { ...f, ...patch } : f)) } : s))

  const dropDraft = (index: number) =>
    setSuggestion((s) => (s ? { ...s, findings: s.findings.filter((_, i) => i !== index) } : s))

  const approve = async (index: number) => {
    const draft = suggestion?.findings[index]
    if (!draft) return
    setSaving(index)
    try {
      await api(`/api/requests/${request.id}/findings`, {
        body: {
          text: draft.text,
          limits: draft.limits,
          linked_note_ids: draft.linked_note_ids,
          echoes_finding_id: draft.echoes?.id ?? null,
          ai_drafted: true,
        },
      })
      toast.add({ title: "Finding saved to the Library", type: "success" })
      dropDraft(index)
      router.refresh()
    } catch (err) {
      toast.add({ title: "Couldn't save the finding", description: errorMessage(err), type: "error" })
    } finally {
      setSaving(null)
    }
  }

  const tabClass = (active: boolean) =>
    cn("rl-pill", active && "text-ink")

  return (
    <div>
      <div className="mb-5 flex gap-2" role="tablist" aria-label="Capture">
        <button type="button" role="tab" aria-selected={tab === "notes"} data-selected={tab === "notes"} className={tabClass(tab === "notes")} onClick={() => setTab("notes")}>
          Notes <span className="rl-mono">{notes.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "findings"} data-selected={tab === "findings"} className={tabClass(tab === "findings")} onClick={() => setTab("findings")}>
          Findings <span className="rl-mono">{findings.length}</span>
        </button>
      </div>

      {tab === "notes" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <TranscriptPaste requestId={request.id} question={request.question} people={people} disabled={locked} />
          <section className="flex flex-col gap-3">
            <h2 className="rl-h2">Saved notes</h2>
            {notes.length === 0 ? (
              <EmptyState title="No notes recorded for this request." />
            ) : (
              notes.map((n) => <NoteCard key={n.id} note={n} />)
            )}
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {!locked && (
            <section className="rl-card flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                  <h2 className="rl-h2">Suggest findings</h2>
                  <p className="rl-hint mt-1">
                    Gemini reads this request&apos;s notes plus the five closest past findings in the Library. Every
                    draft must link to a note and state its limits.
                  </p>
                </div>
                <button type="button" className="rl-btn rl-btn-primary" disabled={suggesting || notes.length === 0} onClick={suggest}>
                  {suggesting ? "Reading notes…" : "Suggest findings"}
                </button>
              </div>

              {notes.length === 0 && <p className="rl-hint">There aren&apos;t enough notes here to suggest findings.</p>}
              {message && <p className="rl-card-inset p-3 text-sm text-ink">{message}</p>}

              {suggestion && (
                <>
                  <ShowThinking
                    meta={suggestion.ai}
                    inputs={[
                      `${suggestion.notes_used} notes from ${request.id}`,
                      `${suggestion.rag.matches.length} past findings via pgvector (${suggestion.rag.search_ms}ms): ${
                        suggestion.rag.matches.map((m) => `“${m.text}” ${Math.round(m.similarity * 100)}%`).join("; ") || "none"
                      }`,
                    ]}
                  />
                  {suggestion.dropped_unlinked > 0 && (
                    <p className="rl-hint">
                      {suggestion.dropped_unlinked} draft{suggestion.dropped_unlinked === 1 ? " was" : "s were"} dropped
                      for not linking to a real note.
                    </p>
                  )}
                  <ul className="flex flex-col gap-3">
                    {suggestion.findings.map((f, i) => (
                      <li key={i} className="rl-card-inset flex flex-col gap-3 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <AiDraftChip />
                          <span className="rl-mono">Linked: {f.linked_people.join(" · ") || `${f.linked_note_ids.length} notes`}</span>
                        </div>
                        <textarea
                          className="rl-input text-base font-medium"
                          aria-label={`Draft finding ${i + 1}`}
                          value={f.text}
                          onChange={(e) => patchDraft(i, { text: e.target.value })}
                        />
                        <div>
                          <label className="rl-mono mb-1 block" htmlFor={`limits-${i}`}>
                            Limits
                          </label>
                          <input id={`limits-${i}`} className="rl-input" value={f.limits} onChange={(e) => patchDraft(i, { limits: e.target.value })} />
                        </div>
                        {f.echoes && (
                          <div className="flex flex-col gap-1.5">
                            <EchoNote echo={f.echoes} />
                            <button type="button" className="rl-link self-start text-[13px]" onClick={() => patchDraft(i, { echoes: null })}>
                              Not the same thing — remove cross-reference
                            </button>
                          </div>
                        )}
                        {f.similar_saved && (
                          <p className="text-[13px] text-ink">
                            <span className="rl-tag mr-2" data-tone="strong">
                              {Math.round(f.similar_saved.similarity * 100)}% like one already saved here
                            </span>
                            “{f.similar_saved.text}”
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rl-btn rl-btn-primary rl-btn-sm"
                            disabled={saving !== null || !f.text.trim() || f.limits.trim().length < 3}
                            onClick={() => approve(i)}
                          >
                            {saving === i ? "Saving…" : "Approve & save"}
                          </button>
                          <button type="button" className="rl-btn rl-btn-ghost rl-btn-sm" onClick={() => dropDraft(i)}>
                            Discard
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="rl-h2">Saved findings</h2>
            {findings.length === 0 ? (
              <EmptyState title="No findings recorded for this request." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {findings.map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <StepFooter requestId={request.id} step="capture" currentStep={request.current_step} locked={locked} />
    </div>
  )
}
