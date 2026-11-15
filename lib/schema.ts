// Drizzle mirror of drizzle/0000_init.sql (brief §11). The SQL file is the source
// of truth; constraint and index names here match what Postgres generates for it,
// so `drizzle-kit push` against a database created from that SQL is a no-op.
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core"
import type { OutcomeKind, Role, Step } from "./utils"

export const EMBEDDING_DIMS = 768

export type RequestStatus = "draft" | "open" | "closed" | "reused"
export type PersonStatus = "considered" | "shortlisted" | "invited" | "scheduled" | "done" | "declined"
export type PointKind = "words" | "interpretation"
export type SourceKind = "request" | "import" | "study" | "support" | "unknown"

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    display_name: text("display_name").notNull(),
    role: text("role").$type<Role>().notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("users_email_key").on(t.email),
    check("users_role_check", sql`${t.role} in ('growth','brand','product','cx','ceo','ops')`),
  ]
)

export const requests = pgTable(
  "requests",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    reason: text("reason"),
    belief: text("belief"),
    area: text("area"),
    owner_id: uuid("owner_id"),
    status: text("status").$type<RequestStatus>().default("draft"),
    current_step: text("current_step").$type<Step>().default("question"),
    context_areas: jsonb("context_areas").$type<string[]>().default(sql`'[]'::jsonb`),
    rating: integer("rating"),
    first_days: integer("first_days"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    closed_at: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({ name: "requests_owner_id_fkey", columns: [t.owner_id], foreignColumns: [users.id] }),
    check("requests_status_check", sql`${t.status} in ('draft','open','closed','reused')`),
    check(
      "requests_current_step_check",
      sql`${t.current_step} in ('question','people','talk','capture','decide')`
    ),
    // RLS is disabled on every table for the prototype (drizzle/0001_disable_rls.sql).
    // The brief's "owners see own requests" policy still exists in the database but
    // is inert; it is not declared here because pgPolicy would switch RLS back on.
  ]
)

export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    request_id: text("request_id"),
    customer_number: text("customer_number"),
    channel: text("channel"),
    segment: text("segment"),
    product: text("product"),
    first_order_days_ago: integer("first_order_days_ago"),
    status: text("status").$type<PersonStatus>().default("considered"),
    decline_reason: text("decline_reason"),
    consent_recorded: boolean("consent_recorded").default(false),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "people_request_id_fkey",
      columns: [t.request_id],
      foreignColumns: [requests.id],
    }).onDelete("cascade"),
    check(
      "people_status_check",
      sql`${t.status} in ('considered','shortlisted','invited','scheduled','done','declined')`
    ),
  ]
)

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    person_id: text("person_id"),
    request_id: text("request_id"),
    interviewer: text("interviewer"),
    question_asked: text("question_asked"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "notes_person_id_fkey",
      columns: [t.person_id],
      foreignColumns: [people.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notes_request_id_fkey",
      columns: [t.request_id],
      foreignColumns: [requests.id],
    }).onDelete("cascade"),
  ]
)

export const note_points = pgTable(
  "note_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    note_id: uuid("note_id"),
    content: text("content").notNull(),
    kind: text("kind").$type<PointKind>().notNull(),
    position: integer("position").default(0),
    ai_drafted: boolean("ai_drafted").default(false),
    approved: boolean("approved").default(false),
  },
  (t) => [
    foreignKey({
      name: "note_points_note_id_fkey",
      columns: [t.note_id],
      foreignColumns: [notes.id],
    }).onDelete("cascade"),
    check("note_points_kind_check", sql`${t.kind} in ('words','interpretation')`),
  ]
)

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    request_id: text("request_id"),
    text: text("text").notNull(),
    source: text("source"),
    source_kind: text("source_kind").$type<SourceKind>().default("request"),
    limits: text("limits"),
    tags: text("tags").array().default(sql`'{}'::text[]`),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "findings_request_id_fkey",
      columns: [t.request_id],
      foreignColumns: [requests.id],
    }).onDelete("set null"),
    check(
      "findings_source_kind_check",
      sql`${t.source_kind} in ('request','import','study','support','unknown')`
    ),
    index("findings_embedding_idx")
      .using("ivfflat", t.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  ]
)

export const finding_notes = pgTable(
  "finding_notes",
  {
    finding_id: uuid("finding_id").notNull(),
    note_id: uuid("note_id").notNull(),
  },
  (t) => [
    primaryKey({ name: "finding_notes_pkey", columns: [t.finding_id, t.note_id] }),
    foreignKey({
      name: "finding_notes_finding_id_fkey",
      columns: [t.finding_id],
      foreignColumns: [findings.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "finding_notes_note_id_fkey",
      columns: [t.note_id],
      foreignColumns: [notes.id],
    }).onDelete("cascade"),
  ]
)

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    request_id: text("request_id"),
    kind: text("kind").$type<OutcomeKind>().notNull(),
    description: text("description").notNull(),
    owner_name: text("owner_name").notNull(),
    review_date: date("review_date").notNull(),
    reviewed: boolean("reviewed").default(false),
    posted_to_slack: boolean("posted_to_slack").default(false),
    linear_ticket_url: text("linear_ticket_url"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "outcomes_request_id_fkey",
      columns: [t.request_id],
      foreignColumns: [requests.id],
    }).onDelete("cascade"),
    check(
      "outcomes_kind_check",
      sql`${t.kind} in ('decision','experiment','follow_up','more_evidence')`
    ),
  ]
)

export const audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor"),
  action: text("action").notNull(),
  target: text("target"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const context_areas = pgTable(
  "context_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspace_scope: boolean("workspace_scope").default(true),
    group_name: text("group_name").notNull(),
    value: text("value").notNull(),
    user_id: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      name: "context_areas_user_id_fkey",
      columns: [t.user_id],
      foreignColumns: [users.id],
    }),
  ]
)

export const source_items = pgTable(
  "source_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_kind: text("source_kind"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("source_items_embedding_idx")
      .using("ivfflat", t.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  ]
)
