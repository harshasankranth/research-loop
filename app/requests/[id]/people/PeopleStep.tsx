"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useApp } from "@/components/Providers"
import { EmptyState, StepFooter } from "@/components/WorkspaceBits"
import { toast } from "@/components/ui/toast"
import type { PersonDTO, RequestDTO } from "@/lib/db"
import { api, errorMessage } from "@/lib/utils"

export interface Candidate {
  customer_number: string
  channel: string
  segment: string
  product: string
  first_order_days_ago: number
}

export interface ShopifyResponse {
  simulated?: boolean
  customers: { id: string; channel: string; segment: string; product: string; first_order_days_ago: number }[]
}

/** Minimal CSV reader: header row, comma-separated, optional double quotes. */
export function parseCsv(text: string): Candidate[] {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()))
  const header = rows[0]?.map((h) => h.toLowerCase()) ?? []
  const col = (name: string) => header.indexOf(name)
  if (col("customer_number") === -1) throw new Error('The CSV needs a "customer_number" column.')
  return rows
    .slice(1)
    .map((r) => ({
      customer_number: r[col("customer_number")] ?? "",
      channel: r[col("channel")] ?? "",
      segment: r[col("segment")] ?? "",
      product: r[col("product")] ?? "",
      first_order_days_ago: Math.max(0, Math.round(Number(r[col("first_order_days_ago")]) || 0)),
    }))
    .filter((c) => c.customer_number)
}

export function PeopleStep({ request, people }: { request: RequestDTO; people: PersonDTO[] }) {
  const router = useRouter()
  const { member } = useApp()
  const locked = request.status === "closed" || request.status === "reused"
  const [filter, setFilter] = useState("orders_count:1")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [origin, setOrigin] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<"pull" | "shortlist" | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  const load = (rows: Candidate[], from: string) => {
    setCandidates(rows)
    setOrigin(from)
    setSelected(new Set())
    setMessage(rows.length === 0 ? `${from} returned no customers for that filter.` : null)
  }

  const pull = async () => {
    setBusy("pull")
    setMessage(null)
    try {
      const res = await api<ShopifyResponse>(`/api/shopify/customers?filter=${encodeURIComponent(filter)}`)
      load(
        res.customers.map((c) => ({ ...c, customer_number: c.id })),
        res.simulated ? "Simulated Shopify data (sample customers; the filter isn't applied)" : "Shopify"
      )
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      load(parseCsv(await file.text()), file.name)
    } catch (err) {
      setMessage(errorMessage(err))
    }
  }

  const loadSample = async () => {
    try {
      load(parseCsv(await (await fetch("/sample-customers.csv")).text()), "sample-customers.csv")
    } catch (err) {
      setMessage(errorMessage(err))
    }
  }

  const shortlist = async () => {
    setBusy("shortlist")
    setMessage(null)
    try {
      const picked = candidates.filter((_, i) => selected.has(i))
      const res = await api<{ people: string[] }>(`/api/requests/${request.id}`, {
        method: "PATCH",
        body: { op: "shortlist", candidates: picked },
      })
      toast.add({ title: `Shortlisted ${res.people.length}`, description: res.people.join(", "), type: "success" })
      setCandidates((c) => c.filter((_, i) => !selected.has(i)))
      setSelected(new Set())
      router.refresh()
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const reveal = async (personId: string) => {
    if (!window.confirm(`Reveal the customer number for ${personId}? This is logged against ${member.name}.`)) return
    try {
      const res = await api<{ customer_number: string | null }>(`/api/requests/${request.id}`, {
        method: "PATCH",
        body: { op: "reveal_contact", person_id: personId },
      })
      setRevealed((r) => ({ ...r, [personId]: res.customer_number ?? "none on file" }))
    } catch (err) {
      toast.add({ title: "Couldn't reveal", description: errorMessage(err), type: "error" })
    }
  }

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const th = "rl-mono px-4 py-3 font-medium"
  const td = "px-4 py-3 text-ink-2"

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="rl-h2">People in this request</h2>
        <p className="rl-hint">
          Customers appear by coded ID only. Research Loop never stores names, emails or phone numbers; the customer
          number is hidden until someone reveals it, and every reveal is written to the audit log.
        </p>
        {people.length === 0 ? (
          <EmptyState title="Nobody is shortlisted yet.">Pull a customer list below and shortlist who to invite.</EmptyState>
        ) : (
          <div className="rl-card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  {["Person", "Channel", "Segment", "Product", "First order", "Status", "Customer number"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="rl-mono px-4 py-3 text-ink">{p.id}</td>
                    <td className={td}>{p.channel ?? "—"}</td>
                    <td className={td}>{p.segment ?? "—"}</td>
                    <td className={td}>{p.product ?? "—"}</td>
                    <td className={td}>{p.first_order_days_ago === null ? "—" : `${p.first_order_days_ago} days ago`}</td>
                    <td className="px-4 py-3">
                      <span className="rl-tag" data-tone={p.status === "done" ? "accent" : undefined}>
                        {p.status}
                      </span>
                      {p.decline_reason && <span className="rl-hint ml-2">{p.decline_reason}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {revealed[p.id] ? (
                        <span className="rl-mono text-ink">{revealed[p.id]}</span>
                      ) : p.has_customer_number ? (
                        <button
                          type="button"
                          className="rl-link text-[13px]"
                          disabled={member.role === "ceo"}
                          onClick={() => reveal(p.id)}
                        >
                          C-•••• · Reveal
                        </button>
                      ) : (
                        <span className="rl-hint">none on file</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!locked && (
        <section className="rl-card flex flex-col gap-4 p-5">
          <div>
            <h2 className="rl-h2">Find customers</h2>
            <p className="rl-hint mt-1">Pull an anonymised segment from Shopify, or upload a CSV from Ops.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="rl-label" htmlFor="pp-filter">
                Shopify customer filter
              </label>
              <input id="pp-filter" className="rl-input font-mono text-[13px]" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <button type="button" className="rl-btn rl-btn-primary" disabled={busy !== null} onClick={pull}>
              {busy === "pull" ? "Pulling…" : "Pull from Shopify"}
            </button>
            <label className="rl-btn cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <button type="button" className="rl-btn rl-btn-ghost" onClick={loadSample}>
              Use sample CSV
            </button>
          </div>

          {message && <p className="rl-card-inset p-3 text-sm text-ink">{message}</p>}

          {candidates.length > 0 && (
            <>
              <p className="rl-mono">
                {candidates.length} candidates from {origin} · {selected.size} selected
              </p>
              <div className="rl-card-inset overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={th}>
                        <span className="sr-only">Select</span>
                      </th>
                      {["Candidate", "Channel", "Segment", "Product", "First order"].map((h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => (
                      <tr key={`${c.customer_number}-${i}`} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select candidate ${i + 1}`}
                            checked={selected.has(i)}
                            onChange={() => toggle(i)}
                            className="size-4 accent-[var(--accent)]"
                          />
                        </td>
                        <td className="rl-mono px-4 py-2.5 text-ink">#{i + 1}</td>
                        <td className={td}>{c.channel || "—"}</td>
                        <td className={td}>{c.segment || "—"}</td>
                        <td className={td}>{c.product || "—"}</td>
                        <td className={td}>{c.first_order_days_ago} days ago</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <button
                  type="button"
                  className="rl-btn rl-btn-primary"
                  disabled={selected.size === 0 || busy !== null || member.role === "ceo"}
                  onClick={shortlist}
                >
                  {busy === "shortlist" ? "Shortlisting…" : `Shortlist ${selected.size || ""} selected`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <StepFooter
        requestId={request.id}
        step="people"
        currentStep={request.current_step}
        locked={locked}
        blocked={people.length === 0 && !locked ? "Shortlist at least one person first." : null}
      />
    </div>
  )
}
