import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom, logAudit } from "@/lib/audit"
import { getDb, getRequest } from "@/lib/db"
import { note_points, notes, people } from "@/lib/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const Body = z.object({
  person_id: z.string(),
  interviewer: z.string().trim().max(80).optional(),
  question_asked: z.string().trim().max(400).optional(),
  points: z
    .array(
      z.object({
        content: z.string().trim().min(1).max(2000),
        kind: z.enum(["words", "interpretation"]),
        ai_drafted: z.boolean().default(false),
      })
    )
    .min(1, "a note needs at least one point")
    .max(40),
})

// Create a note. Reaching this route IS the human approval: drafts live only in
// the browser until someone presses "Approve & save".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())
    const request = await getRequest(id)
    if (!request) return Response.json({ error: `There is no research request ${id}.` }, { status: 404 })
    if (request.status !== "open" && request.status !== "draft") {
      return Response.json({ error: `${id} is ${request.status}, so notes can't be added.` }, { status: 409 })
    }
    if (actor.role === "ceo") return Response.json({ error: `${actor.name} has a read-only view.` }, { status: 403 })

    const db = getDb()
    const [person] = await db
      .select({ id: people.id, status: people.status, consent: people.consent_recorded })
      .from(people)
      .where(and(eq(people.id, body.person_id), eq(people.request_id, id)))
      .limit(1)
    if (!person) return Response.json({ error: `${body.person_id} isn't part of ${id}.` }, { status: 404 })
    if (person.status !== "done" || !person.consent) {
      return Response.json(
        { error: `${person.id} has no completed conversation with consent on record.` },
        { status: 409 }
      )
    }

    const noteId = await db.transaction(async (tx) => {
      const [note] = await tx
        .insert(notes)
        .values({
          person_id: person.id,
          request_id: id,
          interviewer: body.interviewer || actor.name,
          question_asked: body.question_asked || request.question,
        })
        .returning({ id: notes.id })
      await tx.insert(note_points).values(
        body.points.map((p, position) => ({
          note_id: note.id,
          content: p.content,
          kind: p.kind,
          position,
          ai_drafted: p.ai_drafted,
          approved: true,
        }))
      )
      return note.id
    })
    await logAudit({
      actor: actor.name,
      action: "note.approve",
      target: noteId,
      metadata: {
        request_id: id,
        person_id: person.id,
        points: body.points.length,
        ai_drafted_points: body.points.filter((p) => p.ai_drafted).length,
      },
    })
    return Response.json({ ok: true, id: noteId }, { status: 201 })
  } catch (err) {
    return routeError(err)
  }
}
