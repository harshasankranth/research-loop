"use client"

import { useState } from "react"
import { FindingCard } from "@/components/FindingCard"
import { EmptyState } from "@/components/WorkspaceBits"
import type { FindingDTO } from "@/lib/db"
import type { FindingMatch } from "@/lib/rag"
import { api, errorMessage } from "@/lib/utils"

interface SearchResponse {
  results: FindingMatch[]
  timing: { embed_ms: number; search_ms: number }
  close: number
  weak: number
}

export function LibrarySearch({ findings }: { findings: FindingDTO[] }) {
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ query: string; data: SearchResponse } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setBusy(true)
    setError(null)
    try {
      setResult({ query: q, data: await api<SearchResponse>("/api/library/search", { body: { query: q, limit: 8 } }) })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setQuery("")
    setResult(null)
    setError(null)
  }

  const relevant = result ? result.data.results.filter((r) => r.similarity >= result.data.weak) : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-ink">
          The <span className="rl-serif text-[1.1em]">Library</span>
        </h1>
        <p className="rl-hint mt-2 max-w-[60ch]">
          Every finding stays attached to where it came from. If the source isn&apos;t known, it says so — nobody
          fills it in.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input
          className="rl-input h-11 min-w-[260px] flex-1 text-base"
          aria-label="Search findings by meaning"
          placeholder="Search by meaning — e.g. “orders arriving late”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="rl-btn rl-btn-primary h-11" disabled={busy || query.trim().length < 2}>
          {busy ? "Searching…" : "Search"}
        </button>
        {result && (
          <button type="button" className="rl-btn rl-btn-ghost h-11" onClick={clear}>
            Show all
          </button>
        )}
      </form>

      {error && <p className="rl-card-inset p-3 text-sm text-ink">{error}</p>}

      {result ? (
        <section className="flex flex-col gap-3">
          <p className="rl-mono">
            Semantic search · “{result.query}” · pgvector {result.data.timing.search_ms}ms · embed{" "}
            {result.data.timing.embed_ms}ms
          </p>
          {relevant.length === 0 ? (
            <EmptyState title="There isn't anything in the Library close to that.">
              Nothing scored above the weak-match line, so no results are shown rather than loose ones.
            </EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {relevant.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  showRequestLink
                  similarity={{ value: f.similarity, weak: f.similarity < result.data.close }}
                />
              ))}
            </div>
          )}
        </section>
      ) : findings.length === 0 ? (
        <EmptyState title="The Library is empty.">Findings appear here once a request captures them.</EmptyState>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="rl-mono">{findings.length} findings · newest first</p>
          <div className="grid gap-4 md:grid-cols-2">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} showRequestLink />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
