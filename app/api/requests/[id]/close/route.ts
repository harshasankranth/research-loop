import { eq } from "drizzle-orm"
import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom, logAudit } from "@/lib/audit"
import { getDb, getRequest, listOutcomes } from "@/lib/db"
import { requests } from "@/lib/schema"
import { postRequestToSlack, SlackError } from "@/lib/slack"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const Body = z.object({
  // "How useful was this request to the team?" — feeds the CEO summary.
  rating: z.number().int().min(1).max(5).nullable().optional(),
})

// Close a request and post its outcomes to Slack. A person presses the button;
// nothing here is decided by AI.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = actorFrom(req)
    const body = Body.parse(await req.json().catch(() => ({})))
    const request = await getRequest(id)
    if (!request) return Response.json({ error: `There is no research request ${id}.` }, { status: 404 })
    if (request.status === "closed") return Response.json({ error: `${id} is already closed.` }, { status: 409 })
    if (request.status === "reused") return Response.json({ error: `${id} was answered from the Library.` }, { status: 409 })
    // Only the owner closes their request (ops can step in).
    if (actor.name !== request.owner_name && actor.role !== "ops") {
      return Response.json(
        { error: `Only ${request.owner_name ?? "the owner"} can close ${id}. You're viewing as ${actor.name}.` },
        { status: 403 }
      )
    }
    const outcomes = await listOutcomes(id)
    // Guardrail: a request can't close as "interesting" — someone has to own what happens next.
    if (outcomes.length === 0) {
      return Response.json(
        { error: "Add at least one outcome with an owner and a review date before closing." },
        { status: 409 }
      )
    }

    await getDb()
      .update(requests)
      .set({ status: "closed", current_step: "decide", closed_at: new Date(), rating: body.rating ?? null })
      .where(eq(requests.id, id))
    await logAudit({
      actor: actor.name,
      action: "request.close",
      target: id,
      metadata: { outcomes: outcomes.length, rating: body.rating ?? null },
    })

    // The request stays closed even if Slack refuses; the post can be retried.
    let slack: { ok: boolean; channel?: string; error?: string }
    try {
      const posted = await postRequestToSlack(id, actor.name)
      slack = { ok: true, channel: posted.channel }
    } catch (err) {
      slack = { ok: false, error: err instanceof SlackError ? err.message : "Slack didn't accept the post." }
    }
    return Response.json({ ok: true, id, slack })
  } catch (err) {
    return routeError(err)
  }
}
