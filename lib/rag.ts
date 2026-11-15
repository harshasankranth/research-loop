// pgvector retrieval over the findings Library: gemini-embedding-001 (768 dims),
// cosine distance, ivfflat index (brief rule 6).
import { sql } from "drizzle-orm"
import { getDb, getFindingsByIds, type FindingDTO } from "./db"
import { embedText, toVectorLiteral } from "./embeddings"

export interface FindingMatch extends FindingDTO {
  /** Cosine similarity, 0–1. */
  similarity: number
}

export interface NearestOptions {
  limit: number
  /** Leave out findings that belong to this request ("past" = from elsewhere). */
  excludeRequestId?: string
  /** Only findings that belong to this request. */
  onlyRequestId?: string
}

/**
 * The index is built with lists = 100 over a Library that is still small, so the
 * default of probing one list could miss neighbours. Probing every list keeps
 * recall exact at this size; lower it when the Library is large enough to care.
 */
const IVFFLAT_PROBES = 100

export async function nearestFindings(
  vector: number[],
  opts: NearestOptions
): Promise<{ id: string; similarity: number }[]> {
  const literal = toVectorLiteral(vector)
  const scope = opts.onlyRequestId
    ? sql`and request_id = ${opts.onlyRequestId}`
    : opts.excludeRequestId
      ? sql`and request_id is distinct from ${opts.excludeRequestId}`
      : sql``
  const rows = await getDb().transaction(async (tx) => {
    await tx.execute(sql.raw(`set local ivfflat.probes = ${IVFFLAT_PROBES}`))
    return tx.execute(sql`
      select id, 1 - (embedding <=> ${literal}::vector) as similarity
      from findings
      where embedding is not null ${scope}
      order by embedding <=> ${literal}::vector
      limit ${opts.limit}
    `)
  })
  return Array.from(rows, (r) => ({ id: String(r.id), similarity: Number(r.similarity) }))
}

export interface SearchResult {
  matches: FindingMatch[]
  embed_ms: number
  search_ms: number
}

export async function searchFindings(
  query: string,
  opts: { limit?: number; excludeRequestId?: string; actor?: string | null; target?: string | null } = {}
): Promise<SearchResult> {
  const { vector, latency_ms: embed_ms } = await embedText(query, {
    task: "RETRIEVAL_QUERY",
    actor: opts.actor,
    target: opts.target,
  })
  const started = Date.now()
  const nearest = await nearestFindings(vector, {
    limit: opts.limit ?? 5,
    excludeRequestId: opts.excludeRequestId,
  })
  const search_ms = Date.now() - started
  const hydrated = await getFindingsByIds(nearest.map((n) => n.id))
  const byId = new Map(hydrated.map((f) => [f.id, f]))
  const matches: FindingMatch[] = []
  for (const n of nearest) {
    const finding = byId.get(n.id)
    if (finding) matches.push({ ...finding, similarity: n.similarity })
  }
  return { matches, embed_ms, search_ms }
}

/**
 * Similarity bands for gemini-embedding-001 query→document scores, calibrated
 * against the seed Library (see drizzle/seed.ts). Below WEAK a match is shown as
 * weak rather than hidden; the Library says so instead of pretending.
 */
export const SIMILARITY = { close: 0.72, weak: 0.62 } as const
