// Drizzle client plus the read queries shared by pages and API routes.
// Everything returned from here is plain JSON (ISO strings, no Date objects) so
// the same shapes work as server-component props and as API responses.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import type { PersonStatus, PointKind, RequestStatus, SourceKind } from "./schema"
import type { OutcomeKind, Step } from "./utils"

const {
  context_areas,
  finding_notes,
  findings,
  note_points,
  notes,
  outcomes,
  people,
  requests,
  source_items,
  users,
} = schema

export class DbNotConfiguredError extends Error {
  constructor() {
    super(
      "The database isn't connected: DATABASE_URL is missing. Add the Supabase Postgres connection string to .env.local."
    )
    this.name = "DbNotConfiguredError"
  }
}

export type Db = PostgresJsDatabase<typeof schema>

const globalForDb = globalThis as unknown as { __rlDb?: Db }

export function getDb(): Db {
  if (globalForDb.__rlDb) return globalForDb.__rlDb
  const url = process.env.DATABASE_URL
  if (!url) throw new DbNotConfiguredError()
  // prepare:false keeps us compatible with Supabase's transaction pooler.
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 15 })
  globalForDb.__rlDb = drizzle(client, { schema })
  return globalForDb.__rlDb
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

/* ── Requests ───────────────────────────────────────────────────────────── */

export interface RequestDTO {
  id: string
  question: string
  reason: string | null
  belief: string | null
  area: string | null
  owner_id: string | null
  owner_name: string | null
  status: RequestStatus
  current_step: Step
  context_areas: string[]
  rating: number | null
  first_days: number | null
  created_at: string | null
  closed_at: string | null
}

export interface RequestListItem extends RequestDTO {
  conversations_done: number
  findings_count: number
  outcomes_count: number
}

const requestColumns = {
  id: requests.id,
  question: requests.question,
  reason: requests.reason,
  belief: requests.belief,
  area: requests.area,
  owner_id: requests.owner_id,
  owner_name: users.display_name,
  status: requests.status,
  current_step: requests.current_step,
  context_areas: requests.context_areas,
  rating: requests.rating,
  first_days: requests.first_days,
  created_at: requests.created_at,
  closed_at: requests.closed_at,
}

type RequestRow = {
  id: string
  question: string
  reason: string | null
  belief: string | null
  area: string | null
  owner_id: string | null
  owner_name: string | null
  status: RequestStatus | null
  current_step: Step | null
  context_areas: string[] | null
  rating: number | null
  first_days: number | null
  created_at: Date | null
  closed_at: Date | null
}

function toRequestDTO(r: RequestRow): RequestDTO {
  return {
    id: r.id,
    question: r.question,
    reason: r.reason,
    belief: r.belief,
    area: r.area,
    owner_id: r.owner_id,
    owner_name: r.owner_name,
    status: r.status ?? "draft",
    current_step: r.current_step ?? "question",
    context_areas: Array.isArray(r.context_areas) ? r.context_areas : [],
    rating: r.rating,
    first_days: r.first_days,
    created_at: iso(r.created_at),
    closed_at: iso(r.closed_at),
  }
}

// Correlated subqueries name "requests"."id" literally: Drizzle drops the table
// qualifier in single-table selects, which would bind to the inner table instead.
export async function listRequests(): Promise<RequestListItem[]> {
  const rows = await getDb()
    .select({
      ...requestColumns,
      conversations_done: sql<number>`(select count(*)::int from people where people.request_id = "requests"."id" and people.status = 'done')`,
      findings_count: sql<number>`(select count(*)::int from findings where findings.request_id = "requests"."id")`,
      outcomes_count: sql<number>`(select count(*)::int from outcomes where outcomes.request_id = "requests"."id")`,
    })
    .from(requests)
    .leftJoin(users, eq(requests.owner_id, users.id))
    .orderBy(desc(requests.created_at), desc(requests.id))
  return rows.map((r) => ({
    ...toRequestDTO(r),
    conversations_done: Number(r.conversations_done),
    findings_count: Number(r.findings_count),
    outcomes_count: Number(r.outcomes_count),
  }))
}

export async function getRequest(id: string): Promise<RequestDTO | null> {
  const rows = await getDb()
    .select(requestColumns)
    .from(requests)
    .leftJoin(users, eq(requests.owner_id, users.id))
    .where(eq(requests.id, id))
    .limit(1)
  return rows[0] ? toRequestDTO(rows[0]) : null
}

export async function nextRequestId(): Promise<string> {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(substring(${requests.id} from '^R-([0-9]+)$')::int)` })
    .from(requests)
  return `R-${String(Number(row?.max ?? 0) + 1).padStart(3, "0")}`
}

/* ── People ─────────────────────────────────────────────────────────────── */

/** customer_number is deliberately absent: it only leaves the server through an audit-logged reveal. */
export interface PersonDTO {
  id: string
  request_id: string | null
  has_customer_number: boolean
  channel: string | null
  segment: string | null
  product: string | null
  first_order_days_ago: number | null
  status: PersonStatus
  decline_reason: string | null
  consent_recorded: boolean
  scheduled_at: string | null
  completed_at: string | null
}

export async function listPeople(requestId: string): Promise<PersonDTO[]> {
  const rows = await getDb()
    .select()
    .from(people)
    .where(eq(people.request_id, requestId))
    .orderBy(asc(people.id))
  return rows.map((p) => ({
    id: p.id,
    request_id: p.request_id,
    has_customer_number: Boolean(p.customer_number),
    channel: p.channel,
    segment: p.segment,
    product: p.product,
    first_order_days_ago: p.first_order_days_ago,
    status: p.status ?? "considered",
    decline_reason: p.decline_reason,
    consent_recorded: Boolean(p.consent_recorded),
    scheduled_at: iso(p.scheduled_at),
    completed_at: iso(p.completed_at),
  }))
}

/** Highest numeric P-code in use; person ids are sequential across the workspace. */
export async function maxPersonNumber(): Promise<number> {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(substring(${people.id} from '^P-([0-9]+)$')::int)` })
    .from(people)
  return Number(row?.max ?? 0)
}

/* ── Notes ──────────────────────────────────────────────────────────────── */

export interface NotePointDTO {
  id: string
  content: string
  kind: PointKind
  position: number
  ai_drafted: boolean
  approved: boolean
}

export interface NoteDTO {
  id: string
  person_id: string | null
  request_id: string | null
  interviewer: string | null
  question_asked: string | null
  created_at: string | null
  points: NotePointDTO[]
}

export async function listNotes(requestId: string): Promise<NoteDTO[]> {
  const db = getDb()
  const noteRows = await db
    .select()
    .from(notes)
    .where(eq(notes.request_id, requestId))
    .orderBy(asc(notes.created_at), asc(notes.person_id))
  if (noteRows.length === 0) return []
  const pointRows = await db
    .select()
    .from(note_points)
    .where(
      inArray(
        note_points.note_id,
        noteRows.map((n) => n.id)
      )
    )
    .orderBy(asc(note_points.position))
  return noteRows.map((n) => ({
    id: n.id,
    person_id: n.person_id,
    request_id: n.request_id,
    interviewer: n.interviewer,
    question_asked: n.question_asked,
    created_at: iso(n.created_at),
    points: pointRows
      .filter((p) => p.note_id === n.id)
      .map((p) => ({
        id: p.id,
        content: p.content,
        kind: p.kind,
        position: p.position ?? 0,
        ai_drafted: Boolean(p.ai_drafted),
        approved: Boolean(p.approved),
      })),
  }))
}

/* ── Findings ───────────────────────────────────────────────────────────── */

export interface FindingRef {
  id: string
  text: string
  source: string | null
  source_kind: SourceKind
  request_id: string | null
}

export interface FindingDTO extends FindingRef {
  limits: string | null
  tags: string[]
  created_at: string | null
  /** Notes this finding is attached to, and the coded people behind them. */
  note_ids: string[]
  person_ids: string[]
  /** Past finding this one echoes (stored as an `echoes:<id>` tag). */
  echoes: FindingRef | null
}

export const ECHO_TAG_PREFIX = "echoes:"

// The embedding column is never selected for display: 768 floats per row.
const findingColumns = {
  id: findings.id,
  request_id: findings.request_id,
  text: findings.text,
  source: findings.source,
  source_kind: findings.source_kind,
  limits: findings.limits,
  tags: findings.tags,
  created_at: findings.created_at,
}

type FindingRow = {
  id: string
  request_id: string | null
  text: string
  source: string | null
  source_kind: SourceKind | null
  limits: string | null
  tags: string[] | null
  created_at: Date | null
}

async function hydrateFindings(rows: FindingRow[]): Promise<FindingDTO[]> {
  if (rows.length === 0) return []
  const db = getDb()
  const ids = rows.map((r) => r.id)
  const links = await db
    .select({ finding_id: finding_notes.finding_id, note_id: finding_notes.note_id, person_id: notes.person_id })
    .from(finding_notes)
    .innerJoin(notes, eq(finding_notes.note_id, notes.id))
    .where(inArray(finding_notes.finding_id, ids))

  const echoIds = new Set<string>()
  for (const r of rows) {
    for (const tag of r.tags ?? []) {
      if (tag.startsWith(ECHO_TAG_PREFIX)) echoIds.add(tag.slice(ECHO_TAG_PREFIX.length))
    }
  }
  const echoRows = echoIds.size
    ? await db
        .select({
          id: findings.id,
          text: findings.text,
          source: findings.source,
          source_kind: findings.source_kind,
          request_id: findings.request_id,
        })
        .from(findings)
        .where(inArray(findings.id, [...echoIds]))
    : []
  const echoById = new Map(
    echoRows.map((e) => [e.id, { ...e, source_kind: e.source_kind ?? ("unknown" as SourceKind) }])
  )

  return rows.map((r) => {
    const mine = links.filter((l) => l.finding_id === r.id)
    const tags = r.tags ?? []
    const echoTag = tags.find((t) => t.startsWith(ECHO_TAG_PREFIX))
    return {
      id: r.id,
      request_id: r.request_id,
      text: r.text,
      source: r.source,
      // A missing source kind is "unknown". It is never inferred from the text.
      source_kind: r.source_kind ?? "unknown",
      limits: r.limits,
      tags: tags.filter((t) => !t.startsWith(ECHO_TAG_PREFIX)),
      created_at: iso(r.created_at),
      note_ids: mine.map((l) => l.note_id),
      person_ids: [...new Set(mine.map((l) => l.person_id).filter((p): p is string => Boolean(p)))].sort(),
      echoes: echoTag ? (echoById.get(echoTag.slice(ECHO_TAG_PREFIX.length)) ?? null) : null,
    }
  })
}

export async function listFindings(opts: { requestId?: string } = {}): Promise<FindingDTO[]> {
  const rows = await getDb()
    .select(findingColumns)
    .from(findings)
    .where(opts.requestId ? eq(findings.request_id, opts.requestId) : undefined)
    .orderBy(desc(findings.created_at))
  return hydrateFindings(rows)
}

export async function getFindingsByIds(ids: string[]): Promise<FindingDTO[]> {
  if (ids.length === 0) return []
  const rows = await getDb().select(findingColumns).from(findings).where(inArray(findings.id, ids))
  return hydrateFindings(rows)
}

/* ── Outcomes ───────────────────────────────────────────────────────────── */

export interface OutcomeDTO {
  id: string
  request_id: string | null
  kind: OutcomeKind
  description: string
  owner_name: string
  review_date: string
  reviewed: boolean
  posted_to_slack: boolean
  linear_ticket_url: string | null
  created_at: string | null
}

export async function listOutcomes(requestId: string): Promise<OutcomeDTO[]> {
  const rows = await getDb()
    .select()
    .from(outcomes)
    .where(eq(outcomes.request_id, requestId))
    .orderBy(asc(outcomes.created_at))
  return rows.map((o) => ({
    id: o.id,
    request_id: o.request_id,
    kind: o.kind,
    description: o.description,
    owner_name: o.owner_name,
    review_date: o.review_date,
    reviewed: Boolean(o.reviewed),
    posted_to_slack: Boolean(o.posted_to_slack),
    linear_ticket_url: o.linear_ticket_url,
    created_at: iso(o.created_at),
  }))
}

/* ── Docs (stored as source_items rows of kind 'doc') ───────────────────── */

export const DOC_SOURCE_KIND = "doc"

export type DocTemplate = "research_report" | "voice_of_customer" | "blank"

export interface DocDTO {
  id: string
  request_id: string
  title: string
  template: DocTemplate
  html: string
  /** True while the body is an unreviewed Gemini draft. */
  ai_drafted: boolean
  approved: boolean
  created_at: string | null
}

function toDocDTO(row: { id: string; payload: Record<string, unknown> | null; created_at: Date | null }): DocDTO {
  const p = row.payload ?? {}
  const template = p.template === "research_report" || p.template === "voice_of_customer" ? p.template : "blank"
  return {
    id: row.id,
    request_id: typeof p.request_id === "string" ? p.request_id : "",
    title: typeof p.title === "string" ? p.title : "Untitled doc",
    template,
    html: typeof p.html === "string" ? p.html : "",
    ai_drafted: p.ai_drafted === true,
    approved: p.approved === true,
    created_at: iso(row.created_at),
  }
}

export async function listDocs(requestId: string): Promise<DocDTO[]> {
  const rows = await getDb()
    .select({ id: source_items.id, payload: source_items.payload, created_at: source_items.created_at })
    .from(source_items)
    .where(
      and(eq(source_items.source_kind, DOC_SOURCE_KIND), sql`${source_items.payload}->>'request_id' = ${requestId}`)
    )
    .orderBy(desc(source_items.created_at))
  return rows.map(toDocDTO)
}

/* ── Context areas ──────────────────────────────────────────────────────── */

export interface ContextGroup {
  group: string
  values: string[]
}

const GROUP_ORDER = ["Segments", "Topics", "Behaviours"]

export async function listContextAreas(): Promise<ContextGroup[]> {
  const rows = await getDb()
    .select({ group_name: context_areas.group_name, value: context_areas.value })
    .from(context_areas)
    .where(eq(context_areas.workspace_scope, true))
  const byGroup = new Map<string, string[]>()
  for (const r of rows) {
    const list = byGroup.get(r.group_name) ?? []
    list.push(r.value)
    byGroup.set(r.group_name, list)
  }
  const rank = (g: string) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length)
  return [...byGroup.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([group, values]) => ({ group, values: values.sort((a, b) => a.localeCompare(b)) }))
}

/* ── Request state for the assistant (voice + text tools) ───────────────── */

export interface RequestState {
  id: string
  question: string
  status: RequestStatus
  current_step: Step
  owner: string | null
  area: string | null
  context_areas: string[]
  people: Record<PersonStatus, number>
  conversations_done: number
  notes_count: number
  findings_count: number
  latest_finding: string | null
  findings: { text: string; limits: string | null }[]
  outcomes_count: number
  outcomes: { kind: OutcomeKind; description: string; owner_name: string; review_date: string }[]
  closed_at: string | null
}

export async function getRequestState(id: string): Promise<RequestState | null> {
  const request = await getRequest(id)
  if (!request) return null
  const [peopleRows, noteRows, findingRows, outcomeRows] = await Promise.all([
    listPeople(id),
    listNotes(id),
    listFindings({ requestId: id }),
    listOutcomes(id),
  ])
  const peopleCounts: Record<PersonStatus, number> = {
    considered: 0,
    shortlisted: 0,
    invited: 0,
    scheduled: 0,
    done: 0,
    declined: 0,
  }
  for (const p of peopleRows) peopleCounts[p.status] += 1
  return {
    id: request.id,
    question: request.question,
    status: request.status,
    current_step: request.current_step,
    owner: request.owner_name,
    area: request.area,
    context_areas: request.context_areas,
    people: peopleCounts,
    conversations_done: peopleCounts.done,
    notes_count: noteRows.length,
    findings_count: findingRows.length,
    latest_finding: findingRows[0]?.text ?? null,
    findings: findingRows.map((f) => ({ text: f.text, limits: f.limits })),
    outcomes_count: outcomeRows.length,
    outcomes: outcomeRows.map((o) => ({
      kind: o.kind,
      description: o.description,
      owner_name: o.owner_name,
      review_date: o.review_date,
    })),
    closed_at: request.closed_at,
  }
}

/* ── CEO summary (brief §19: four numbers, nothing else) ────────────────── */

export interface SummaryStats {
  /** Median days from opening a request to its first completed conversation. */
  median_first_days: number | null
  first_days_sample: number
  /** Share of closed requests that left with at least one owned outcome. */
  owned_outcome_pct: number | null
  closed_requests: number
  closed_with_outcome: number
  /** Times a past finding was reused: echoed by a new finding, or a request answered from the Library. */
  findings_reused: number
  /** Mean 1–5 usefulness rating given by the team when closing. */
  usefulness_rating: number | null
  rating_sample: number
}

export async function getSummaryStats(): Promise<SummaryStats> {
  const db = getDb()
  const [reqRow] = await db
    .select({
      median_first_days: sql<number | null>`percentile_cont(0.5) within group (order by ${requests.first_days}) filter (where ${requests.first_days} is not null)`,
      first_days_sample: sql<number>`count(${requests.first_days})::int`,
      closed_requests: sql<number>`count(*) filter (where ${requests.status} = 'closed')::int`,
      closed_with_outcome: sql<number>`count(*) filter (where ${requests.status} = 'closed' and exists (select 1 from outcomes where outcomes.request_id = "requests"."id"))::int`,
      reused_requests: sql<number>`count(*) filter (where ${requests.status} = 'reused')::int`,
      usefulness_rating: sql<number | null>`avg(${requests.rating})`,
      rating_sample: sql<number>`count(${requests.rating})::int`,
    })
    .from(requests)
  const [findingRow] = await db
    .select({
      echoing: sql<number>`count(*) filter (where exists (select 1 from unnest(${findings.tags}) as t where t like 'echoes:%'))::int`,
    })
    .from(findings)

  const closed = Number(reqRow?.closed_requests ?? 0)
  const withOutcome = Number(reqRow?.closed_with_outcome ?? 0)
  const median = reqRow?.median_first_days
  const rating = reqRow?.usefulness_rating
  return {
    median_first_days: median === null || median === undefined ? null : Number(median),
    first_days_sample: Number(reqRow?.first_days_sample ?? 0),
    owned_outcome_pct: closed > 0 ? Math.round((withOutcome / closed) * 100) : null,
    closed_requests: closed,
    closed_with_outcome: withOutcome,
    findings_reused: Number(findingRow?.echoing ?? 0) + Number(reqRow?.reused_requests ?? 0),
    usefulness_rating: rating === null || rating === undefined ? null : Number(rating),
    rating_sample: Number(reqRow?.rating_sample ?? 0),
  }
}
