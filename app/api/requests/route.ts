import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom, logAudit } from "@/lib/audit"
import { getDb, listRequests, nextRequestId } from "@/lib/db"
import { requests, users } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  try {
    const status = new URL(req.url).searchParams.get("status")
    const all = await listRequests()
    return Response.json({ requests: status ? all.filter((r) => r.status === status) : all })
  } catch (err) {
    return routeError(err)
  }
}

const CreateBody = z.object({
  question: z.string().trim().min(12, "write the question out in full").max(400),
  reason: z.string().trim().max(1000).optional(),
  belief: z.string().trim().max(1000).optional(),
  area: z.string().trim().max(80).optional(),
  context_areas: z.array(z.string().max(80)).max(20).default([]),
})

export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    if (!actor.canOwn) {
      return Response.json({ error: `${actor.name} can't own a research request.` }, { status: 403 })
    }
    const body = CreateBody.parse(await req.json())
    const db = getDb()
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, actor.email)).limit(1)
    if (!owner) {
      return Response.json({ error: `${actor.name} isn't in the users table yet. Run the seed first.` }, { status: 409 })
    }
    const id = await nextRequestId()
    // The question is written in the modal, so a new request opens at People.
    await db.insert(requests).values({
      id,
      question: body.question,
      reason: body.reason || null,
      belief: body.belief || null,
      area: body.area || null,
      owner_id: owner.id,
      status: "open",
      current_step: "people",
      context_areas: body.context_areas,
    })
    await logAudit({ actor: actor.name, action: "request.create", target: id, metadata: { question: body.question } })
    return Response.json({ id }, { status: 201 })
  } catch (err) {
    return routeError(err)
  }
}
