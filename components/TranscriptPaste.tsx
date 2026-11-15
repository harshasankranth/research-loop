"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KindChip } from "@/components/NoteCard"
import { AiDraftChip, ShowThinking } from "@/components/ShowThinking"
import { toast } from "@/components/ui/toast"
import type { AiMeta } from "@/lib/ai"
import type { PersonDTO } from "@/lib/db"
import type { PointKind } from "@/lib/schema"
import { api, currentActor, errorMessage } from "@/lib/utils"

interface DraftPoint {
  content: string
  kind: PointKind
  /** For "words" points: was the text found verbatim in the transcript? */
  verbatim: boolean | null
}

interface DraftResponse {
  points: DraftPoint[]
  ai: AiMeta
}

/** Paste a transcript → Gemini drafts a note → a person reviews, edits, approves. */
export function TranscriptPaste({
  requestId,
  question,
  people,
  disabled,
}: {
  requestId: string
  question: string
  people: PersonDTO[]
  disabled?: boolean
}) {
  const router = useRouter()
  const eligible = people.filter((p) => p.status === "done" && p.consent_recorded)
  const [personId, setPersonId] = useState(eligible[0]?.id ?? "")
  const [transcript, setTranscript] = useState("")
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<DraftResponse | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const draftNote = async () => {
    setDrafting(true)
    setMessage(null)
    setDraft(null)
    try {
      const res = await api<DraftResponse>("/api/ai/transcript-to-note", {
        body: { request_id: requestId, person_id: personId, transcript },
      })
      if (res.points.length === 0) {
        setMessage("Gemini found nothing in this transcript it could support, so it drafted no points.")
      } else {
        setDraft(res)
      }
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setDrafting(false)
    }
  }

  const updatePoint = (index: number, patch: Partial<DraftPoint>) =>
    setDraft((d) => (d ? { ...d, points: d.points.map((p, i) => (i === index ? { ...p, ...patch } : p)) } : d))

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    try {
      await api(`/api/requests/${requestId}/notes`, {
        body: {
          person_id: personId,
          interviewer: currentActor(),
          question_asked: question,
          points: draft.points
            .filter((p) => p.content.trim())
            .map((p) => ({ content: p.content.trim(), kind: p.kind, ai_drafted: true })),
        },
      })
      toast.add({ title: "Note saved", description: `Approved by ${currentActor()} for ${personId}.`, type: "success" })
      setDraft(null)
      setTranscript("")
      router.refresh()
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rl-card flex flex-col gap-4 p-5">
      <div>
        <h2 className="rl-h2">Paste a transcript</h2>
        <p className="rl-hint mt-1">
          Paste text only. Research Loop doesn&apos;t record or transcribe audio — record with consent in your own
          tool, then paste the transcript here.
        </p>
      </div>

      {eligible.length === 0 ? (
        <p className="rl-hint">
          No completed conversations with consent recorded yet. Mark a conversation done on the Talk step first.
        </p>
      ) : (
        <>
          <div>
            <label className="rl-label" htmlFor="tp-person">
              Conversation with
            </label>
            <select
              id="tp-person"
              className="rl-input"
              value={personId}
              disabled={disabled}
              onChange={(e) => setPersonId(e.target.value)}
            >
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — {[p.segment, p.product].filter(Boolean).join(", ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rl-label" htmlFor="tp-transcript">
              Transcript
            </label>
            <textarea
              id="tp-transcript"
              className="rl-input min-h-40 font-mono text-[13px]"
              value={transcript}
              disabled={disabled}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the conversation transcript…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rl-btn rl-btn-primary"
              disabled={disabled || drafting || transcript.trim().length === 0}
              onClick={draftNote}
            >
              {drafting ? "Drafting…" : "Draft note with AI"}
            </button>
            {disabled && <span className="rl-hint">This request is closed, so notes are read-only.</span>}
          </div>
        </>
      )}

      {message && <p className="rl-card-inset p-3 text-sm text-ink">{message}</p>}

      {draft && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <AiDraftChip />
            <span className="rl-hint">Nothing is saved until you approve. Edit or remove any point.</span>
          </div>
          <ul className="flex flex-col gap-3">
            {draft.points.map((p, i) => (
              <li key={i} className="rl-card-inset flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <KindChip kind={p.kind} />
                  <AiDraftChip />
                  {p.kind === "words" && p.verbatim === false && (
                    <span className="rl-tag" data-tone="strong">
                      Not found word-for-word in the transcript
                    </span>
                  )}
                  <button
                    type="button"
                    className="rl-link ml-auto text-[13px]"
                    onClick={() =>
                      updatePoint(i, { kind: p.kind === "words" ? "interpretation" : "words", verbatim: null })
                    }
                  >
                    Mark as {p.kind === "words" ? "interpretation" : "words"}
                  </button>
                  <button
                    type="button"
                    className="rl-link text-[13px]"
                    onClick={() => setDraft((d) => (d ? { ...d, points: d.points.filter((_, j) => j !== i) } : d))}
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  className="rl-input"
                  aria-label={`Draft point ${i + 1}`}
                  value={p.content}
                  onChange={(e) => updatePoint(i, { content: e.target.value, verbatim: null })}
                />
              </li>
            ))}
          </ul>
          <ShowThinking
            meta={draft.ai}
            inputs={["The pasted transcript", `Coded customer info for ${personId}`, "This request's question and context areas"]}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rl-btn rl-btn-primary"
              disabled={saving || draft.points.every((p) => !p.content.trim())}
              onClick={save}
            >
              {saving ? "Saving…" : "Approve & save note"}
            </button>
            <button type="button" className="rl-btn rl-btn-ghost" onClick={() => setDraft(null)}>
              Discard draft
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
