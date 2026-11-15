import type { NoteDTO } from "@/lib/db"
import type { PointKind } from "@/lib/schema"
import { cn, formatDate } from "@/lib/utils"

/** Words (verbatim) vs interpretation (someone's reading) — always kept apart. */
export function KindChip({ kind }: { kind: PointKind }) {
  return (
    <span className="rl-tag shrink-0" data-tone={kind === "words" ? "strong" : undefined}>
      {kind === "words" ? "Words" : "Interpretation"}
    </span>
  )
}

export function NoteCard({ note, className }: { note: NoteDTO; className?: string }) {
  return (
    <article className={cn("rl-card flex flex-col gap-3 p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rl-mono text-ink">{note.person_id ?? "Unknown person"}</span>
        <span className="rl-hint">
          {note.interviewer ? `Interviewer: ${note.interviewer}` : "No interviewer recorded"} ·{" "}
          {formatDate(note.created_at)}
        </span>
      </div>
      {note.question_asked && <p className="text-[13px] text-ink-2">Asked: {note.question_asked}</p>}
      <ul className="flex flex-col gap-2">
        {note.points.map((p) => (
          <li key={p.id} className="flex items-start gap-2.5">
            <KindChip kind={p.kind} />
            <span className={cn("text-sm", p.kind === "words" ? "text-ink" : "text-ink-2")}>
              {p.kind === "words" ? `“${p.content}”` : p.content}
              {p.ai_drafted && <span className="rl-mono ml-2">AI-drafted · approved</span>}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}
