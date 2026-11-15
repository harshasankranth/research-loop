import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom, logAudit } from "@/lib/audit"
import { DOC_SOURCE_KIND, getDb, getRequest, getRequestState, maxPersonNumber } from "@/lib/db"
import { outcomes, people, requests, source_items } from "@/lib/schema"
import { OUTCOME_KINDS, STEPS, memberByName } from "@/lib/utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type Ctx = { params: Promise<{ id: string }> }

// Read: the request's current state. This is what the assistant's lookup_request tool sees.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const state = await getRequestState(id)
    if (!state) return Response.json({ error: `There is no research request ${id}.` }, { status: 404 })
    return Response.json(state)
  } catch (err) {
    return routeError(err)
  }
}

const Candidate = z.object({
  customer_number: z.string().trim().min(1).max(40),
  channel: z.string().trim().max(60).optional(),
  segment: z.string().trim().max(60).optional(),
  product: z.string().trim().max(80).optional(),
  first_order_days_ago: z.number().int().min(0).max(100000).optional(),
})

// Update: one small, explicit operation per call.
const PatchBody = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update"),
    question: z.string().trim().min(12).max(400).optional(),
    reason: z.string().trim().max(1000).optional(),
    belief: z.string().trim().max(1000).optional(),
    area: z.string().trim().max(80).optional(),
    context_areas: z.array(z.string().max(80)).max(20).optional(),
    current_step: z.enum(STEPS).optional(),
  }),
  z.object({ op: z.literal("shortlist"), candidates: z.array(Candidate).min(1).max(60) }),
  z.object({
    op: z.literal("person_status"),
    person_id: z.string(),
    status: z.enum(["shortlisted", "invited", "scheduled", "done", "declined"]),
    decline_reason: z.string().trim().max(200).optional(),
    consent_recorded: z.boolean().optional(),
    scheduled_at: z.string().optional(),
  }),
  z.object({ op: z.literal("reveal_contact"), person_id: z.string() }),
  z.object({
    op: z.literal("add_outcome"),
    kind: z.enum(OUTCOME_KINDS),
    description: z.string().trim().min(5, "say what will happen").max(500),
    owner_name: z.string().trim().min(1, "every outcome needs an owner"),
    review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a review date"),
  }),
  z.object({ op: z.literal("remove_outcome"), outcome_id: z.string().uuid() }),
  z.object({
    op: z.literal("save_doc"),
    doc_id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(160),
    template: z.enum(["research_report", "voice_of_customer", "blank"]),
    html: z.string().max(200_000),
    ai_drafted: z.boolean(),
  }),
])

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const actor = actorFrom(req)
    const body = PatchBody.parse(await req.json())
    const request = await getRequest(id)
    if (!request) return Response.json({ error: `There is no research request ${id}.` }, { status: 404 })
    if (actor.role === "ceo") {
      return Response.json({ error: `${actor.name} has a read-only view.` }, { status: 403 })
    }
    const db = getDb()
    const closed = request.status === "closed" || request.status === "reused"
    // Docs stay editable after close; everything else is frozen with the request.
    if (closed && body.op !== "save_doc") {
      return Response.json({ error: `${id} is ${request.status}, so it can't be changed.` }, { status: 409 })
    }

    switch (body.op) {
      case "update": {
        const { op: _op, ...fields } = body
        void _op
        if (Object.keys(fields).length === 0) return Response.json({ ok: true })
        await db.update(requests).set(fields).where(eq(requests.id, id))
        await logAudit({ actor: actor.name, action: "request.update", target: id, metadata: { fields: Object.keys(fields) } })
        return Response.json({ ok: true })
      }

      case "shortlist": {
        let n = await maxPersonNumber()
        const rows = body.candidates.map((c) => ({
          id: `P-${String(++n).padStart(2, "0")}`,
          request_id: id,
          customer_number: c.customer_number,
          channel: c.channel ?? null,
          segment: c.segment ?? null,
          product: c.product ?? null,
          first_order_days_ago: c.first_order_days_ago ?? null,
          status: "shortlisted" as const,
        }))
        await db.insert(people).values(rows)
        await logAudit({
          actor: actor.name,
          action: "people.shortlist",
          target: id,
          metadata: { people: rows.map((r) => r.id) },
        })
        return Response.json({ ok: true, people: rows.map((r) => r.id) })
      }

      case "person_status": {
        const [person] = await db
          .select()
          .from(people)
          .where(and(eq(people.id, body.person_id), eq(people.request_id, id)))
          .limit(1)
        if (!person) return Response.json({ error: `${body.person_id} isn't part of ${id}.` }, { status: 404 })
        const consent = body.consent_recorded ?? Boolean(person.consent_recorded)
        // Guardrail: a conversation only counts once consent is on record.
        if (body.status === "done" && !consent) {
          return Response.json(
            { error: "Record the customer's consent before marking this conversation done." },
            { status: 409 }
          )
        }
        if (body.status === "declined" && !body.decline_reason) {
          return Response.json({ error: "Add a short reason for the decline." }, { status: 400 })
        }
        const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null
        if (body.status === "scheduled" && (!scheduledAt || Number.isNaN(scheduledAt.getTime()))) {
          return Response.json({ error: "Pick a date and time for the conversation." }, { status: 400 })
        }
        const now = new Date()
        await db
          .update(people)
          .set({
            status: body.status,
            consent_recorded: consent,
            decline_reason: body.status === "declined" ? body.decline_reason : null,
            scheduled_at: body.status === "scheduled" ? scheduledAt : person.scheduled_at,
            completed_at: body.status === "done" ? now : null,
          })
          .where(eq(people.id, person.id))
        // First completed conversation fixes "days to first conversation" for the CEO summary.
        if (body.status === "done" && request.first_days === null && request.created_at) {
          const days = Math.max(0, Math.round((now.getTime() - new Date(request.created_at).getTime()) / 86_400_000))
          await db.update(requests).set({ first_days: days }).where(eq(requests.id, id))
        }
        await logAudit({
          actor: actor.name,
          action: "person.status",
          target: person.id,
          metadata: { request_id: id, from: person.status, to: body.status, consent_recorded: consent },
        })
        return Response.json({ ok: true })
      }

      case "reveal_contact": {
        const [person] = await db
          .select({ id: people.id, customer_number: people.customer_number })
          .from(people)
          .where(and(eq(people.id, body.person_id), eq(people.request_id, id)))
          .limit(1)
        if (!person) return Response.json({ error: `${body.person_id} isn't part of ${id}.` }, { status: 404 })
        // Logged before the value is returned: no reveal without a record.
        await logAudit({
          actor: actor.name,
          action: "contact.reveal",
          target: person.id,
          metadata: { request_id: id, role: actor.role },
        })
        return Response.json({ person_id: person.id, customer_number: person.customer_number })
      }

      case "add_outcome": {
        if (!memberByName(body.owner_name)) {
          return Response.json({ error: `${body.owner_name} isn't on the team, so can't own an outcome.` }, { status: 400 })
        }
        const [row] = await db
          .insert(outcomes)
          .values({
            request_id: id,
            kind: body.kind,
            description: body.description,
            owner_name: body.owner_name,
            review_date: body.review_date,
          })
          .returning({ id: outcomes.id })
        await logAudit({
          actor: actor.name,
          action: "outcome.add",
          target: id,
          metadata: { outcome_id: row.id, kind: body.kind, owner: body.owner_name, review_date: body.review_date },
        })
        return Response.json({ ok: true, id: row.id }, { status: 201 })
      }

      case "remove_outcome": {
        await db.delete(outcomes).where(and(eq(outcomes.id, body.outcome_id), eq(outcomes.request_id, id)))
        await logAudit({ actor: actor.name, action: "outcome.remove", target: id, metadata: { outcome_id: body.outcome_id } })
        return Response.json({ ok: true })
      }

      case "save_doc": {
        // Saving is the human approval: the doc stops being an unreviewed AI draft.
        const payload = {
          request_id: id,
          title: body.title,
          template: body.template,
          html: body.html,
          ai_drafted: body.ai_drafted,
          approved: true,
          approved_by: actor.name,
        }
        let docId = body.doc_id
        if (docId) {
          await db
            .update(source_items)
            .set({ payload })
            .where(and(eq(source_items.id, docId), eq(source_items.source_kind, DOC_SOURCE_KIND)))
        } else {
          const [row] = await db
            .insert(source_items)
            .values({ source_kind: DOC_SOURCE_KIND, payload })
            .returning({ id: source_items.id })
          docId = row.id
        }
        await logAudit({ actor: actor.name, action: "doc.save", target: id, metadata: { doc_id: docId, title: body.title } })
        return Response.json({ ok: true, id: docId })
      }
    }
  } catch (err) {
    return routeError(err)
  }
}
