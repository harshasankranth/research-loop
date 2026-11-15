import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom, logAudit } from "@/lib/audit"
import { ECHO_TAG_PREFIX, getDb, getRequest } from "@/lib/db"
import { embedText } from "@/lib/embeddings"
import { finding_notes, findings, notes } from "@/lib/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const Body = z.object({
  text: z.string().trim().min(5).max(600),
  limits: z.string().trim().min(3, "say what this finding can't prove").max(600),
  linked_note_ids: z.array(z.string().uuid()).min(1, "link at least one note").max(40),
  echoes_finding_id: z.string().uuid().nullable().optional(),
  ai_drafted: z.boolean().default(false),
})

// Create a finding. A finding can't exist without a source note and stated limits.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())
    const request = await getRequest(id)
    if (!request) return Response.json({ error: `There is no research request ${id}.` }, { status: 404 })
    if (request.status !== "open" && request.status !== "draft") {
      return Response.json({ error: `${id} is ${request.status}, so findings can't be added.` }, { status: 409 })
    }
    if (actor.role === "ceo") return Response.json({ error: `${actor.name} has a read-only view.` }, { status: 403 })

    const db = getDb()
    const noteRows = await db
      .select({ id: notes.id, person_id: notes.person_id })
      .from(notes)
      .where(and(eq(notes.request_id, id), inArray(notes.id, body.linked_note_ids)))
    if (noteRows.length !== new Set(body.linked_note_ids).size) {
      return Response.json({ error: `Every linked note must belong to ${id}.` }, { status: 400 })
    }
    if (body.echoes_finding_id) {
      const [echo] = await db.select({ id: findings.id }).from(findings).where(eq(findings.id, body.echoes_finding_id)).limit(1)
      if (!echo) return Response.json({ error: "The past finding this one echoes no longer exists." }, { status: 400 })
    }

    const { vector } = await embedText(body.text, { task: "RETRIEVAL_DOCUMENT", actor: actor.name, target: id })
    const peopleCodes = [...new Set(noteRows.map((n) => n.person_id).filter(Boolean))].sort()

    const findingId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(findings)
        .values({
          request_id: id,
          text: body.text,
          source: `${id} · ${peopleCodes.length} of the conversations (${peopleCodes.join(", ")})`,
          source_kind: "request",
          limits: body.limits,
          tags: body.echoes_finding_id ? [`${ECHO_TAG_PREFIX}${body.echoes_finding_id}`] : [],
          embedding: vector,
        })
        .returning({ id: findings.id })
      await tx.insert(finding_notes).values(noteRows.map((n) => ({ finding_id: row.id, note_id: n.id })))
      return row.id
    })
    await logAudit({
      actor: actor.name,
      action: "finding.approve",
      target: findingId,
      metadata: {
        request_id: id,
        ai_drafted: body.ai_drafted,
        linked_notes: noteRows.length,
        echoes_finding_id: body.echoes_finding_id ?? null,
      },
    })
    return Response.json({ ok: true, id: findingId }, { status: 201 })
  } catch (err) {
    return routeError(err)
  }
}
