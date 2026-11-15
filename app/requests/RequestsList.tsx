"use client"

import { useState } from "react"
import Link from "next/link"
import { useApp } from "@/components/Providers"
import { StatusTag } from "@/components/RequestStepper"
import { EmptyState } from "@/components/WorkspaceBits"
import type { RequestListItem } from "@/lib/db"
import { formatDate, STEP_LABEL } from "@/lib/utils"

type Filter = "all" | "open" | "closed"

export function RequestsList({ requests }: { requests: RequestListItem[] }) {
  const { member, openNewRequest } = useApp()
  const [filter, setFilter] = useState<Filter>("all")
  const shown = requests.filter((r) =>
    filter === "all" ? true : filter === "open" ? r.status === "open" || r.status === "draft" : r.status === "closed" || r.status === "reused"
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-ink">
          Research <span className="rl-serif text-[1.1em]">requests</span>
        </h1>
        <button type="button" className="rl-btn rl-btn-primary ml-auto" disabled={!member.canOwn} onClick={openNewRequest}>
          + New
        </button>
      </div>

      <div className="flex gap-2" role="radiogroup" aria-label="Filter by status">
        {(["all", "open", "closed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            data-selected={filter === f}
            className="rl-pill capitalize"
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={requests.length === 0 ? "No research requests yet." : `No ${filter} requests.`} />
      ) : (
        <div className="rl-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {["ID", "Question", "Owner", "Status", "Step", "Findings", "Outcomes", "Opened"].map((h) => (
                  <th key={h} className="rl-mono px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/requests/${r.id}`} className="rl-mono text-ink hover:text-accent-2">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${r.id}`} className="font-medium text-ink hover:underline">
                      {r.question}
                    </Link>
                    {r.area && <span className="rl-hint ml-2">{r.area}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{r.owner_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusTag status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-2">{r.status === "open" ? STEP_LABEL[r.current_step] : "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{r.findings_count}</td>
                  <td className="px-4 py-3 text-ink-2">{r.outcomes_count}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-2">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
