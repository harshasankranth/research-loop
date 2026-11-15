import Link from "next/link"
import type { FindingDTO, FindingRef } from "@/lib/db"
import type { SourceKind } from "@/lib/schema"
import { cn } from "@/lib/utils"

const SOURCE_LABEL: Record<SourceKind, string> = {
  request: "Research request",
  import: "Import",
  study: "Study",
  support: "Support",
  unknown: "Source unknown",
}

/** Provenance badge. "Source unknown" is shown as recorded and never guessed. */
export function SourceBadge({ kind }: { kind: SourceKind }) {
  return (
    <span className="rl-tag" data-tone={kind === "unknown" ? "strong" : undefined}>
      {SOURCE_LABEL[kind]}
    </span>
  )
}

export function EchoNote({ echo }: { echo: FindingRef }) {
  return (
    <div className="rl-card-inset px-3 py-2 text-[13px] text-ink-2">
      <span className="rl-mono mr-2 text-accent-2">Echoes</span>
      “{echo.text}”
      <span className="ml-2 inline-flex align-middle">
        <SourceBadge kind={echo.source_kind} />
      </span>
      {echo.source && echo.source_kind !== "unknown" && <span className="ml-2">{echo.source}</span>}
    </div>
  )
}

export function FindingCard({
  finding,
  similarity,
  showRequestLink = false,
  className,
}: {
  finding: FindingDTO
  /** Cosine similarity from a semantic search, when there is one. */
  similarity?: { value: number; weak: boolean }
  showRequestLink?: boolean
  className?: string
}) {
  return (
    <article className={cn("rl-card flex flex-col gap-3 p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge kind={finding.source_kind} />
        {finding.tags.map((tag) => (
          <span key={tag} className="rl-tag">
            {tag}
          </span>
        ))}
        {similarity && (
          <span className="rl-tag ml-auto" data-tone={similarity.weak ? undefined : "accent"}>
            {Math.round(similarity.value * 100)}% {similarity.weak ? "weak match" : "match"}
          </span>
        )}
      </div>

      <p className="text-base font-medium text-ink">{finding.text}</p>

      {finding.limits && (
        <p className="text-sm text-ink-2">
          <span className="rl-mono mr-2">Limits</span>
          {finding.limits}
        </p>
      )}

      {finding.echoes && <EchoNote echo={finding.echoes} />}

      <p className="mt-auto text-[13px] text-ink-2">
        {finding.source_kind === "unknown" ? (
          "Source unknown — kept as recorded, never guessed."
        ) : (
          <>
            {finding.source ?? "No source recorded"}
            {finding.person_ids.length > 0 && <span className="rl-mono ml-2">{finding.person_ids.join(" · ")}</span>}
          </>
        )}
        {showRequestLink && finding.request_id && (
          <Link href={`/requests/${finding.request_id}/capture`} className="rl-link ml-2">
            Open {finding.request_id}
          </Link>
        )}
      </p>
    </article>
  )
}
