export { cn } from "cn"

/* ── Storage keys (brief §18: rules 13, 14) ─────────────────────────────── */
export const THEME_KEY = "rl-theme"
export const ROLE_KEY = "rl-role"
export const CONTEXT_KEY = "rl-context"

/* ── Team (brief §3) ────────────────────────────────────────────────────── */
export type Role = "growth" | "brand" | "product" | "cx" | "ceo" | "ops"

export interface TeamMember {
  name: string
  role: Role
  title: string
  email: string
  /** Sana reads findings and Kiran is read-only: neither can own a request. */
  canOwn: boolean
  /** Ravi is seeded as a user but is not a demo persona in the role picker. */
  inPicker: boolean
}

export const TEAM: readonly TeamMember[] = [
  { name: "Anita", role: "growth", title: "Growth lead", email: "anita@everydaygoods.example", canOwn: true, inPicker: true },
  { name: "Priya", role: "brand", title: "Brand lead", email: "priya@everydaygoods.example", canOwn: true, inPicker: true },
  { name: "Dev", role: "product", title: "Product lead", email: "dev@everydaygoods.example", canOwn: true, inPicker: true },
  { name: "Sana", role: "cx", title: "CX lead", email: "sana@everydaygoods.example", canOwn: false, inPicker: true },
  { name: "Kiran", role: "ceo", title: "CEO", email: "kiran@everydaygoods.example", canOwn: false, inPicker: true },
  { name: "Ravi", role: "ops", title: "Ops / data support", email: "ravi@everydaygoods.example", canOwn: true, inPicker: false },
]

export const DEFAULT_MEMBER = TEAM[0]

export function memberByName(name: string | null | undefined): TeamMember | undefined {
  if (!name) return undefined
  return TEAM.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
}

/* ── Request steps ──────────────────────────────────────────────────────── */
export const STEPS = ["question", "people", "talk", "capture", "decide"] as const
export type Step = (typeof STEPS)[number]

export const STEP_LABEL: Record<Step, string> = {
  question: "Question",
  people: "People",
  talk: "Talk",
  capture: "Capture",
  decide: "Decide",
}

export const OUTCOME_KINDS = ["decision", "experiment", "follow_up", "more_evidence"] as const
export type OutcomeKind = (typeof OUTCOME_KINDS)[number]

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  decision: "Decision",
  experiment: "Experiment",
  follow_up: "Follow-up",
  more_evidence: "More evidence",
}

export const AREAS = ["Shampoo", "Body wash", "Moisturiser"] as const

/* ── Formatting (deterministic, so server and client render the same) ───── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "17 Nov 2026" from an ISO timestamp or a YYYY-MM-DD date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/* ── Client fetch helper ────────────────────────────────────────────────── */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Name of the acting demo persona, read from sessionStorage (browser only). */
export function currentActor(): string {
  if (typeof window === "undefined") return DEFAULT_MEMBER.name
  try {
    return memberByName(window.sessionStorage.getItem(ROLE_KEY))?.name ?? DEFAULT_MEMBER.name
  } catch {
    return DEFAULT_MEMBER.name
  }
}

/**
 * JSON fetch against our own API routes. Sends the acting persona so every
 * server-side action and AI call can be audit-logged against a person.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      "x-rl-actor": currentActor(),
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    // Never serve our own API from the browser's HTTP cache: tool calls need live data.
    cache: "no-store",
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // Non-JSON body: handled below.
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }
  return data as T
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === "string" ? err : "Something went wrong"
}
