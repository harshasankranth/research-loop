"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useApp } from "@/components/Providers"
import { EmptyState } from "@/components/WorkspaceBits"
import { toast } from "@/components/ui/toast"
import type { OutcomeDTO, RequestDTO } from "@/lib/db"
import { api, errorMessage, formatDate, OUTCOME_KINDS, OUTCOME_LABEL, TEAM, type OutcomeKind } from "@/lib/utils"

interface CloseResponse {
  ok: true
  slack: { ok: boolean; channel?: string; error?: string }
}

export function DecideStep({
  request,
  outcomes,
  findingsCount,
}: {
  request: RequestDTO
  outcomes: OutcomeDTO[]
  findingsCount: number
}) {
  const router = useRouter()
  const { member } = useApp()
  const closed = request.status === "closed" || request.status === "reused"
  const [kind, setKind] = useState<OutcomeKind>("experiment")
  const [description, setDescription] = useState("")
  const [owner, setOwner] = useState(request.owner_name ?? member.name)
  const [reviewDate, setReviewDate] = useState("")
  const [rating, setRating] = useState<number | null>(null)
  const [busy, setBusy] = useState<"add" | "close" | "slack" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slackNote, setSlackNote] = useState<string | null>(null)

  const isOwner = member.name === request.owner_name || member.role === "ops"
  const unposted = outcomes.some((o) => !o.posted_to_slack)

  const add = async () => {
    setBusy("add")
    setError(null)
    try {
      await api(`/api/requests/${request.id}`, {
        method: "PATCH",
        body: { op: "add_outcome", kind, description: description.trim(), owner_name: owner, review_date: reviewDate },
      })
      setDescription("")
      setReviewDate("")
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    try {
      await api(`/api/requests/${request.id}`, { method: "PATCH", body: { op: "remove_outcome", outcome_id: id } })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const close = async () => {
    if (!window.confirm(`Close ${request.id} and post its ${outcomes.length} outcomes to #research? Closing can't be undone.`)) return
    setBusy("close")
    setError(null)
    try {
      const res = await api<CloseResponse>(`/api/requests/${request.id}/close`, { body: { rating } })
      if (res.slack.ok) {
        toast.add({ title: `${request.id} closed`, description: `Posted to ${res.slack.channel}.`, type: "success" })
      } else {
        setSlackNote(`${request.id} is closed, but Slack didn't take the post: ${res.slack.error}`)
      }
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const postToSlack = async () => {
    setBusy("slack")
    setSlackNote(null)
    try {
      const res = await api<{ channel: string }>("/api/slack/post", { body: { request_id: request.id } })
      toast.add({ title: `Posted to ${res.channel}`, type: "success" })
      router.refresh()
    } catch (err) {
      setSlackNote(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="rl-h2">Outcomes</h2>
        <p className="rl-hint">
          A request can&apos;t close as &ldquo;interesting&rdquo;. Each outcome has an owner and a date it gets
          reviewed.
        </p>
        {outcomes.length === 0 ? (
          <EmptyState title="No outcomes yet.">Add at least one before closing.</EmptyState>
        ) : (
          outcomes.map((o) => (
            <article key={o.id} className="rl-card flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rl-tag" data-tone="accent">
                  {OUTCOME_LABEL[o.kind]}
                </span>
                {o.posted_to_slack && <span className="rl-tag">Posted to #research</span>}
                {!closed && (
                  <button type="button" className="rl-link ml-auto text-[13px]" onClick={() => remove(o.id)}>
                    Remove
                  </button>
                )}
              </div>
              <p className="text-base font-medium text-ink">{o.description}</p>
              <p className="text-[13px] text-ink-2">
                Owner: {o.owner_name} · Review: {formatDate(o.review_date)}
              </p>
            </article>
          ))
        )}

        {closed && (
          <div className="rl-card mt-3 flex flex-col gap-3 p-5">
            <p className="font-medium text-ink">
              {request.status === "reused" ? "Answered from the Library." : `Closed ${formatDate(request.closed_at)}.`}
              {request.rating ? ` Team usefulness rating: ${request.rating} of 5.` : ""}
            </p>
            {slackNote && <p className="rl-card-inset p-3 text-sm text-ink">{slackNote}</p>}
            <div className="flex flex-wrap gap-2">
              <Link href={`/requests/${request.id}/docs?draft=report`} className="rl-btn rl-btn-primary">
                Draft the research report
              </Link>
              {request.status === "closed" && unposted && (
                <button type="button" className="rl-btn" disabled={busy !== null || member.role === "ceo"} onClick={postToSlack}>
                  {busy === "slack" ? "Posting…" : "Post to #research"}
                </button>
              )}
              <Link href="/summary" className="rl-btn rl-btn-ghost">
                See the CEO summary
              </Link>
            </div>
          </div>
        )}
      </section>

      {!closed && (
        <aside className="flex flex-col gap-5">
          <div className="rl-card flex flex-col gap-4 p-5">
            <h2 className="rl-h2">Add an outcome</h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Outcome type">
              {OUTCOME_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  data-selected={kind === k}
                  className="rl-pill"
                  onClick={() => setKind(k)}
                >
                  {OUTCOME_LABEL[k]}
                </button>
              ))}
            </div>
            <div>
              <label className="rl-label" htmlFor="oc-desc">
                What will happen
              </label>
              <textarea id="oc-desc" className="rl-input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="rl-label" htmlFor="oc-owner">
                  Owner
                </label>
                <select id="oc-owner" className="rl-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {TEAM.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rl-label" htmlFor="oc-date">
                  Review date
                </label>
                <input id="oc-date" type="date" className="rl-input" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className="rl-btn"
              disabled={busy !== null || description.trim().length < 5 || !reviewDate || member.role === "ceo"}
              onClick={add}
            >
              {busy === "add" ? "Adding…" : "Add outcome"}
            </button>
          </div>

          <div className="rl-card flex flex-col gap-4 p-5">
            <h2 className="rl-h2">Close this request</h2>
            <div>
              <p className="rl-label">How useful was this request to the team?</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Usefulness rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    data-selected={rating === n}
                    className="rl-pill w-10 justify-center px-0"
                    onClick={() => setRating(rating === n ? null : n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="rl-hint">
              Closing posts {outcomes.length} outcome{outcomes.length === 1 ? "" : "s"} to #research and freezes the
              request. {findingsCount} finding{findingsCount === 1 ? "" : "s"} stay in the Library.
            </p>
            {!isOwner && (
              <p className="rl-hint">
                Only {request.owner_name ?? "the owner"} can close this. You&apos;re viewing as {member.name}.
              </p>
            )}
            {error && <p className="rl-card-inset p-3 text-sm text-ink">{error}</p>}
            <button type="button" className="rl-btn rl-btn-primary" disabled={busy !== null || outcomes.length === 0 || !isOwner} onClick={close}>
              {busy === "close" ? "Closing…" : "Close & Post"}
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}
