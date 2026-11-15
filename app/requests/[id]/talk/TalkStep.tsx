"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AiDraftChip, ShowThinking } from "@/components/ShowThinking"
import { StepFooter } from "@/components/WorkspaceBits"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import type { AiMeta } from "@/lib/ai"
import type { PersonDTO, RequestDTO } from "@/lib/db"
import type { PersonStatus } from "@/lib/schema"
import { api, errorMessage, formatDate } from "@/lib/utils"

const COLUMNS: { status: PersonStatus; label: string }[] = [
  { status: "shortlisted", label: "Shortlisted" },
  { status: "invited", label: "Invited" },
  { status: "scheduled", label: "Scheduled" },
  { status: "done", label: "Done" },
  { status: "declined", label: "Declined" },
]

interface Guide {
  prompts: string[]
  avoid: string[]
  ai: AiMeta
}

export function TalkStep({ request, people }: { request: RequestDTO; people: PersonDTO[] }) {
  const router = useRouter()
  const locked = request.status === "closed" || request.status === "reused"
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Per-card inputs.
  const [when, setWhen] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState<Record<string, boolean>>({})

  // Invite draft modal.
  const [inviteFor, setInviteFor] = useState<PersonDTO | null>(null)
  const [invite, setInvite] = useState<{ text: string; ai: AiMeta } | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Interview guide sidebar.
  const [guide, setGuide] = useState<Guide | null>(null)
  const [guideBusy, setGuideBusy] = useState(false)
  const [guideError, setGuideError] = useState<string | null>(null)

  const move = async (person: PersonDTO, status: PersonStatus, extra: Record<string, unknown> = {}) => {
    setPending(person.id)
    setError(null)
    try {
      await api(`/api/requests/${request.id}`, {
        method: "PATCH",
        body: { op: "person_status", person_id: person.id, status, ...extra },
      })
      router.refresh()
      return true
    } catch (err) {
      setError(`${person.id}: ${errorMessage(err)}`)
      return false
    } finally {
      setPending(null)
    }
  }

  const decline = (person: PersonDTO) => {
    const reason = window.prompt(`Why did ${person.id} decline? (e.g. No reply, No time)`)?.trim()
    if (reason) void move(person, "declined", { decline_reason: reason })
  }

  const openInvite = async (person: PersonDTO) => {
    setInviteFor(person)
    setInvite(null)
    setInviteError(null)
    setInviteBusy(true)
    try {
      setInvite(await api<{ text: string; ai: AiMeta }>("/api/ai/write-doc", { body: { request_id: request.id, kind: "invite" } }))
    } catch (err) {
      setInviteError(errorMessage(err))
    } finally {
      setInviteBusy(false)
    }
  }

  const draftGuide = async () => {
    setGuideBusy(true)
    setGuideError(null)
    try {
      setGuide(await api<Guide>("/api/ai/write-doc", { body: { request_id: request.id, kind: "guide" } }))
    } catch (err) {
      setGuideError(errorMessage(err))
    } finally {
      setGuideBusy(false)
    }
  }

  return (
    <div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          {error && <p className="rl-card-inset mb-4 p-3 text-sm text-ink">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {COLUMNS.map((col) => {
              const cards = people.filter((p) => p.status === col.status)
              return (
                <div key={col.status} className="rl-card-inset flex min-h-40 flex-col gap-2 p-3">
                  <p className="rl-mono flex items-center justify-between">
                    {col.label} <span>{cards.length}</span>
                  </p>
                  {cards.length === 0 && <p className="rl-hint text-[13px]">Nobody here.</p>}
                  {cards.map((p) => (
                    <div key={p.id} className="rl-card flex flex-col gap-2 p-3">
                      <p className="rl-mono text-ink">{p.id}</p>
                      <p className="text-[13px] text-ink-2">{[p.segment, p.channel].filter(Boolean).join(" · ") || "No attributes"}</p>
                      {p.status === "scheduled" && p.scheduled_at && (
                        <p className="text-[13px] text-ink-2">For {formatDate(p.scheduled_at)}</p>
                      )}
                      {p.status === "done" && (
                        <p className="text-[13px] text-ink-2">
                          {p.consent_recorded ? "Consent recorded" : "No consent on record"} · {formatDate(p.completed_at)}
                        </p>
                      )}
                      {p.status === "declined" && <p className="text-[13px] text-ink-2">{p.decline_reason ?? "No reason given"}</p>}

                      {!locked && p.status === "shortlisted" && (
                        <button type="button" className="rl-btn rl-btn-sm" onClick={() => openInvite(p)}>
                          Draft invite
                        </button>
                      )}
                      {!locked && p.status === "invited" && (
                        <>
                          <input
                            type="datetime-local"
                            aria-label={`Conversation time for ${p.id}`}
                            className="rl-input px-2 py-1 text-[13px]"
                            value={when[p.id] ?? ""}
                            onChange={(e) => setWhen((w) => ({ ...w, [p.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="rl-btn rl-btn-sm"
                            disabled={pending === p.id || !when[p.id]}
                            onClick={() => move(p, "scheduled", { scheduled_at: new Date(when[p.id]).toISOString() })}
                          >
                            Schedule
                          </button>
                        </>
                      )}
                      {!locked && p.status === "scheduled" && (
                        <>
                          <label className="flex items-start gap-2 text-[13px] text-ink">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-4 accent-[var(--accent)]"
                              checked={consent[p.id] ?? false}
                              onChange={(e) => setConsent((c) => ({ ...c, [p.id]: e.target.checked }))}
                            />
                            Customer gave consent
                          </label>
                          <button
                            type="button"
                            className="rl-btn rl-btn-primary rl-btn-sm"
                            disabled={pending === p.id || !consent[p.id]}
                            title={consent[p.id] ? undefined : "Record consent first"}
                            onClick={() => move(p, "done", { consent_recorded: true })}
                          >
                            Mark done
                          </button>
                        </>
                      )}
                      {!locked && (p.status === "shortlisted" || p.status === "invited" || p.status === "scheduled") && (
                        <button type="button" className="rl-link self-start text-[13px]" disabled={pending === p.id} onClick={() => decline(p)}>
                          Declined…
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <p className="rl-hint mt-3">
            A conversation can only be marked done once consent is recorded. Research Loop doesn&apos;t send invites or
            record calls — you do, in your own tools.
          </p>
        </section>

        <aside className="rl-card flex flex-col gap-3 self-start p-5">
          <h2 className="rl-h2">Interview guide</h2>
          {!guide && <p className="rl-hint">A 20-minute guide drafted from this request&apos;s question and context areas.</p>}
          {guide && (
            <>
              <AiDraftChip label="AI draft — review before using" />
              <div>
                <p className="rl-mono mb-1.5">Open prompts</p>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink">
                  {guide.prompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              </div>
              {guide.avoid.length > 0 && (
                <div>
                  <p className="rl-mono mb-1.5">Avoid — leading</p>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2">
                    {guide.avoid.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ShowThinking meta={guide.ai} inputs={["This request's question", "Its context areas"]} />
            </>
          )}
          {guideError && <p className="text-sm text-ink">{guideError}</p>}
          <button type="button" className="rl-btn" disabled={guideBusy} onClick={draftGuide}>
            {guideBusy ? "Drafting…" : guide ? "Draft again" : "Draft guide with AI"}
          </button>
        </aside>
      </div>

      <Dialog open={inviteFor !== null} onOpenChange={(open) => !open && setInviteFor(null)}>
        <DialogContent className="gap-4 p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Invite for {inviteFor?.id}</DialogTitle>
            <DialogDescription>
              Edit freely, then send it yourself. Research Loop never emails customers.
            </DialogDescription>
          </DialogHeader>
          {inviteBusy && (
            <p className="rl-mono flex items-center gap-2">
              <span className="rl-live-dot" /> Drafting invite…
            </p>
          )}
          {inviteError && <p className="rl-card-inset p-3 text-sm text-ink">{inviteError}</p>}
          {invite && (
            <>
              <AiDraftChip label="AI draft — review before sending" />
              <textarea
                className="rl-input min-h-44"
                aria-label="Invite text"
                value={invite.text}
                onChange={(e) => setInvite({ ...invite, text: e.target.value })}
              />
              <ShowThinking meta={invite.ai} inputs={["This request's context areas", "No customer name or contact details"]} />
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {invite && (
              <button
                type="button"
                className="rl-btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(invite.text)
                  toast.add({ title: "Invite copied", type: "success" })
                }}
              >
                Copy text
              </button>
            )}
            <button
              type="button"
              className="rl-btn rl-btn-primary"
              disabled={!inviteFor || pending !== null}
              onClick={async () => {
                if (inviteFor && (await move(inviteFor, "invited"))) setInviteFor(null)
              }}
            >
              I&apos;ve sent it — mark invited
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <StepFooter requestId={request.id} step="talk" currentStep={request.current_step} locked={locked} />
    </div>
  )
}
