// Seed data from the brief (§16). Run: npx tsx drizzle/seed.ts
// Resets the demo tables, then loads users, context areas, R-001…R-003 and the
// Library, embedding every finding with gemini-embedding-001 (768 dims).
import { sql } from "drizzle-orm"
import { getDb } from "../lib/db"
import { embedTexts } from "../lib/embeddings"
import {
  context_areas,
  finding_notes,
  findings,
  note_points,
  notes,
  outcomes,
  people,
  requests,
  users,
  type PointKind,
  type SourceKind,
} from "../lib/schema"
import { TEAM } from "../lib/utils"

try {
  process.loadEnvFile(".env.local")
} catch {
  // Fall through to the real environment.
}

const CONTEXT = {
  Segments: ["First-time buyers", "Repeat", "Lapsed", "Gift", "Household"],
  Topics: ["Delivery", "Pricing", "Product feel", "Packaging", "Fragrance", "Subscription"],
  Behaviours: ["Churn", "Discovery", "Habit", "Switching", "Recommendation"],
}

const R003 = "R-003"
const R003_QUESTION = "Why don't first-time shampoo buyers buy again?"

// The brief fixes ids, statuses, consent and decline reasons. Channel, customer
// number and order age are placeholder attributes for the People grid.
const PEOPLE: {
  id: string
  customer_number: string
  channel: string
  segment: string
  first_order_days_ago: number
  status: "done" | "declined"
  decline_reason?: string
  completed?: string
}[] = [
  { id: "P-01", customer_number: "C-1042", channel: "Website", segment: "First-time", first_order_days_ago: 41, status: "done", completed: "2026-10-30T10:00:00Z" },
  { id: "P-02", customer_number: "C-1057", channel: "Website", segment: "Gift", first_order_days_ago: 52, status: "done", completed: "2026-11-02T11:30:00Z" },
  { id: "P-03", customer_number: "C-1063", channel: "Website", segment: "First-time", first_order_days_ago: 63, status: "done", completed: "2026-11-03T09:00:00Z" },
  { id: "P-04", customer_number: "C-1071", channel: "Marketplace", segment: "First-time", first_order_days_ago: 58, status: "done", completed: "2026-11-04T14:00:00Z" },
  { id: "P-05", customer_number: "C-1088", channel: "Website", segment: "First-time", first_order_days_ago: 74, status: "done", completed: "2026-11-05T16:00:00Z" },
  { id: "P-06", customer_number: "C-1094", channel: "Marketplace", segment: "First-time", first_order_days_ago: 66, status: "declined", decline_reason: "No reply" },
  { id: "P-07", customer_number: "C-1102", channel: "Website", segment: "First-time", first_order_days_ago: 49, status: "declined", decline_reason: "No reply" },
  { id: "P-08", customer_number: "C-1115", channel: "Website", segment: "First-time", first_order_days_ago: 80, status: "declined", decline_reason: "No time" },
]

const NOTES: { person: string; points: { kind: PointKind; content: string }[] }[] = [
  {
    person: "P-01",
    points: [
      { kind: "words", content: "I'm still using my first bottle" },
      { kind: "interpretation", content: "may not have needed to reorder yet" },
    ],
  },
  { person: "P-02", points: [{ kind: "words", content: "Bought it for family member, don't know if she liked it" }] },
  { person: "P-03", points: [{ kind: "words", content: "It felt heavy on my hair" }] },
  { person: "P-04", points: [{ kind: "words", content: "Came nine days late, bought another brand" }] },
  { person: "P-05", points: [{ kind: "words", content: "I forgot about it" }] },
]

const R003_FINDINGS: { text: string; people: string[]; limits: string }[] = [
  { text: "Some first-time buyers may not have finished their first bottle", people: ["P-01", "P-05"], limits: "2 of 5" },
  { text: "One buyer found shampoo heavy", people: ["P-03"], limits: "one conversation" },
  { text: "Late delivery drove switching in one case", people: ["P-04"], limits: "one; how common is unknown" },
  { text: "Gift buyer couldn't judge the product", people: ["P-02"], limits: "one conversation" },
  {
    text: "Nobody raised price",
    people: ["P-01", "P-02", "P-03", "P-04", "P-05"],
    limits: "all five; doesn't prove price isn't a reason",
  },
]

// "Customers find us expensive" has no known source. It stays that way: DO NOT GUESS A SOURCE.
const LIBRARY: { text: string; source: string | null; source_kind: SourceKind; tags: string[] }[] = [
  { text: "Three repeat buyers said a different shampoo felt heavy", source: "2025 product study", source_kind: "study", tags: [] },
  { text: "Customers find us expensive", source: null, source_kind: "unknown", tags: [] },
  {
    text: "Late deliveries on marketplace orders come up in support tickets every month",
    source: "CX support review Sep 2026",
    source_kind: "support",
    tags: ["recurring"],
  },
]

async function main() {
  const db = getDb()

  // Embed first: if Gemini fails, the database is left untouched.
  const texts = [...R003_FINDINGS.map((f) => f.text), ...LIBRARY.map((f) => f.text)]
  console.log(`Embedding ${texts.length} findings with gemini-embedding-001…`)
  const { vectors, latency_ms } = await embedTexts(texts, { task: "RETRIEVAL_DOCUMENT", actor: "seed", target: "library" })
  console.log(`  done in ${latency_ms}ms (${vectors[0].length} dims)`)

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table finding_notes, note_points, notes, findings, outcomes, people, requests, context_areas, source_items, users cascade`
    )

    const userRows = await tx
      .insert(users)
      .values(TEAM.map((m) => ({ email: m.email, display_name: m.name, role: m.role })))
      .returning({ id: users.id, name: users.display_name })
    const userId = (name: string) => userRows.find((u) => u.name === name)!.id

    await tx.insert(context_areas).values(
      Object.entries(CONTEXT).flatMap(([group_name, values]) =>
        values.map((value) => ({ group_name, value, workspace_scope: true }))
      )
    )

    // rating, first_days and the timestamps are not in the brief: they are
    // placeholder values so the CEO summary has numbers to show.
    await tx.insert(requests).values([
      {
        id: "R-001",
        question: "How do people fit body wash into their morning routine?",
        area: "Body wash",
        owner_id: userId("Priya"),
        status: "closed",
        current_step: "decide",
        context_areas: [],
        rating: 4,
        first_days: 6,
        created_at: new Date("2026-09-21T09:00:00Z"),
        closed_at: new Date("2026-10-13T15:00:00Z"),
      },
      {
        id: "R-002",
        question: "What makes moisturiser customers switch brands?",
        area: "Moisturiser",
        owner_id: userId("Dev"),
        status: "closed",
        current_step: "decide",
        context_areas: [],
        rating: 4,
        first_days: 9,
        created_at: new Date("2026-09-28T09:00:00Z"),
        closed_at: new Date("2026-10-22T15:00:00Z"),
      },
      {
        id: R003,
        question: R003_QUESTION,
        reason: "First-time shampoo buyers aren't coming back. Growth needs to decide what to try next.",
        belief: "Some of us think price, but we haven't checked.",
        area: "Shampoo",
        owner_id: userId("Anita"),
        status: "open",
        current_step: "capture",
        context_areas: ["First-time buyers", "Delivery", "Product feel", "Churn"],
        first_days: 4,
        created_at: new Date("2026-10-26T09:00:00Z"),
      },
    ])

    await tx.insert(outcomes).values([
      { request_id: "R-001", kind: "decision", description: 'Use "a quick reset" in winter campaign', owner_name: "Priya", review_date: "2026-11-17" },
      { request_id: "R-001", kind: "follow_up", description: "Household buyers differ?", owner_name: "Priya", review_date: "2026-10-27" },
      { request_id: "R-002", kind: "experiment", description: "Sturdier pump on 200ml", owner_name: "Dev", review_date: "2026-12-01" },
      { request_id: "R-002", kind: "follow_up", description: "Count returns mentioning pump", owner_name: "Ravi", review_date: "2026-11-05" },
    ])

    await tx.insert(people).values(
      PEOPLE.map((p) => ({
        id: p.id,
        request_id: R003,
        customer_number: p.customer_number,
        channel: p.channel,
        segment: p.segment,
        product: "Shampoo 250ml",
        first_order_days_ago: p.first_order_days_ago,
        status: p.status,
        decline_reason: p.decline_reason ?? null,
        consent_recorded: p.status === "done",
        completed_at: p.completed ? new Date(p.completed) : null,
      }))
    )

    const noteIdByPerson = new Map<string, string>()
    for (const n of NOTES) {
      const person = PEOPLE.find((p) => p.id === n.person)!
      const [row] = await tx
        .insert(notes)
        .values({
          person_id: n.person,
          request_id: R003,
          interviewer: "Anita",
          question_asked: R003_QUESTION,
          created_at: new Date(person.completed!),
        })
        .returning({ id: notes.id })
      noteIdByPerson.set(n.person, row.id)
      await tx.insert(note_points).values(
        n.points.map((p, position) => ({ note_id: row.id, content: p.content, kind: p.kind, position, approved: true }))
      )
    }

    for (const [i, f] of R003_FINDINGS.entries()) {
      const [row] = await tx
        .insert(findings)
        .values({
          request_id: R003,
          text: f.text,
          source: `${R003} · ${f.people.join(", ")}`,
          source_kind: "request",
          limits: f.limits,
          embedding: vectors[i],
          // The late-delivery finding is the most recent one on R-003.
          created_at: new Date(Date.UTC(2026, 10, 6, 10, f.text.startsWith("Late delivery") ? 30 : i)),
        })
        .returning({ id: findings.id })
      await tx.insert(finding_notes).values(f.people.map((p) => ({ finding_id: row.id, note_id: noteIdByPerson.get(p)! })))
    }

    await tx.insert(findings).values(
      LIBRARY.map((f, i) => ({
        request_id: null,
        text: f.text,
        source: f.source,
        source_kind: f.source_kind,
        limits: null,
        tags: f.tags,
        embedding: vectors[R003_FINDINGS.length + i],
        created_at: new Date(Date.UTC(2026, 8, 30, 10, i)),
      }))
    )
  })

  const counts = await db.execute(sql`
    select (select count(*) from users)::int as users, (select count(*) from requests)::int as requests,
           (select count(*) from people)::int as people, (select count(*) from notes)::int as notes,
           (select count(*) from findings where embedding is not null)::int as embedded_findings,
           (select count(*) from outcomes)::int as outcomes, (select count(*) from context_areas)::int as context_areas
  `)
  console.log("Seeded:", counts[0])
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err)
    process.exit(1)
  })
