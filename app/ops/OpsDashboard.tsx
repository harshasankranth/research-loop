"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { parseCsv, type Candidate, type ShopifyResponse } from "@/app/requests/[id]/people/PeopleStep"
import { toast } from "@/components/ui/toast"
import { api, errorMessage, formatDate } from "@/lib/utils"

export interface NeedsList {
  id: string
  question: string
  owner_name: string | null
  area: string | null
}

export interface AccessRow {
  id: string
  at: string | null
  actor: string
  role: string | null
  person: string
  request_id: string | null
}

const FILTERS = [
  { value: "orders_count:1", label: "First-time buyers" },
  { value: "orders_count:>1", label: "Repeat buyers" },
  { value: "orders_count:1 AND created_at:<-60d", label: "First-time, 60+ days ago" },
  { value: "tag:subscriber", label: "Subscribers" },
]

export function OpsDashboard({ needs, access }: { needs: NeedsList[]; access: AccessRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState(FILTERS[0].value)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const csvTarget = useRef<string | null>(null)

  const importList = async (requestId: string, rows: Candidate[], from: string) => {
    if (rows.length === 0) {
      setMessage(`${from} returned no customers, so nothing was added to ${requestId}.`)
      return
    }
    const res = await api<{ people: string[] }>(`/api/requests/${requestId}`, {
      method: "PATCH",
      body: { op: "shortlist", candidates: rows.slice(0, 60) },
    })
    toast.add({ title: `${requestId}: ${res.people.length} customers added`, description: `From ${from}`, type: "success" })
    router.refresh()
  }

  const pull = async (requestId: string) => {
    setBusy(requestId)
    setMessage(null)
    try {
      const res = await api<ShopifyResponse>(`/api/shopify/customers?filter=${encodeURIComponent(filter)}`)
      await importList(
        requestId,
        res.customers.map((c) => ({ ...c, customer_number: c.id })),
        res.simulated ? "simulated Shopify data (sample customers; the filter isn't applied)" : "Shopify"
      )
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    const requestId = csvTarget.current
    if (!file || !requestId) return
    setBusy(requestId)
    setMessage(null)
    try {
      await importList(requestId, parseCsv(await file.text()), file.name)
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-ink">
          Ops <span className="rl-serif text-[1.1em]">dashboard</span>
        </h1>
        <p className="rl-hint mt-2 max-w-[62ch]">
          Import controlled customer lists for requests that are waiting on one, and see who has revealed a customer
          contact.
        </p>
      </div>

      <section className="rl-card flex flex-col gap-4 p-5" aria-labelledby="ops-needs">
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-auto">
            <h2 id="ops-needs" className="rl-h2">
              Requests that need a customer list
            </h2>
            <p className="rl-hint mt-1">Open requests with nobody shortlisted yet.</p>
          </div>
          <div>
            <label className="rl-label" htmlFor="ops-filter">
              Shopify segment
            </label>
            <select id="ops-filter" className="rl-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Upload a customer CSV"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        {message && (
          <p role="alert" className="text-sm text-ink">
            {message}
          </p>
        )}

        {needs.length === 0 ? (
          <p className="text-sm text-ink-2">No request is waiting on a customer list right now.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {needs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[240px] flex-1">
                  <p className="rl-mono">
                    {r.id}
                    {r.area ? ` · ${r.area}` : ""}
                    {r.owner_name ? ` · ${r.owner_name}` : ""}
                  </p>
                  <Link href={`/requests/${r.id}/people`} className="text-[15px] font-medium text-ink hover:underline">
                    {r.question}
                  </Link>
                </div>
                <button type="button" className="rl-btn rl-btn-primary" disabled={busy !== null} onClick={() => void pull(r.id)}>
                  {busy === r.id ? "Working…" : "Pull from Shopify"}
                </button>
                <button
                  type="button"
                  className="rl-btn"
                  disabled={busy !== null}
                  onClick={() => {
                    csvTarget.current = r.id
                    fileInput.current?.click()
                  }}
                >
                  Upload CSV
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="rl-hint">
          Customers are added as coded IDs only. CSV columns: customer_number, channel, segment, product,
          first_order_days_ago.{" "}
          <a className="underline" href="/sample-customers.csv" download>
            Download a sample CSV
          </a>
          .
        </p>
      </section>

      <section className="rl-card flex flex-col gap-4 p-5" aria-labelledby="ops-access">
        <div>
          <h2 id="ops-access" className="rl-h2">
            Contact access log
          </h2>
          <p className="rl-hint mt-1">Every time someone revealed a customer number, most recent first.</p>
        </div>
        {access.length === 0 ? (
          <p className="text-sm text-ink-2">Nobody has revealed a customer contact yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  {["When", "Who", "Role", "Contact", "Request"].map((h) => (
                    <th key={h} className="rl-mono py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {access.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink-2">
                      {row.at
                        ? `${formatDate(row.at)}, ${new Date(row.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Unknown"}
                    </td>
                    <td className="py-2 pr-4 font-medium text-ink">{row.actor}</td>
                    <td className="py-2 pr-4 text-ink-2">{row.role ?? "Unknown"}</td>
                    <td className="py-2 pr-4 font-mono text-[13px] text-ink">{row.person}</td>
                    <td className="py-2 pr-4">
                      {row.request_id ? (
                        <Link href={`/requests/${row.request_id}/people`} className="text-ink underline">
                          {row.request_id}
                        </Link>
                      ) : (
                        <span className="text-ink-2">Unknown</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
