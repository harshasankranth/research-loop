import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { postRequestToSlack, SlackError, slackErrorResponse } from "@/lib/slack"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const Body = z.object({ request_id: z.string().trim().regex(/^R-\d+$/, "expected an id like R-003") })

// Post a closed request's outcome summary to #research.
export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    if (actor.role === "ceo") {
      return Response.json({ ok: false, error: `${actor.name} has a read-only view.` }, { status: 403 })
    }
    const { request_id } = Body.parse(await req.json())
    return Response.json(await postRequestToSlack(request_id, actor.name))
  } catch (err) {
    if (err instanceof SlackError) return slackErrorResponse(err)
    return routeError(err)
  }
}
