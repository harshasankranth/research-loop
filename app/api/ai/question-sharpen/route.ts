import { z } from "zod"
import { generateJson, routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { getRequest, listFindings } from "@/lib/db"
import { fill, FOLLOWUP_QUESTION, QUESTION_SHARPEN } from "@/lib/prompts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const Body = z.union([
  z.object({
    question: z.string().trim().min(12, "write the question out in full").max(400),
    contextAreas: z.array(z.string().max(80)).max(20).default([]),
    request_id: z.string().optional(),
  }),
  // The assistant's suggest_followup_question tool posts only a request id.
  z.object({ request_id: z.string().trim().regex(/^R-\d+$/) }),
])

const Sharpen = z.object({ verdict: z.enum(["clear", "sharpen"]), note: z.string() })
const Followup = z.object({ question: z.string(), why: z.string() })

export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())

    if ("question" in body) {
      const { data, meta } = await generateJson(
        {
          action: "ai.question_sharpen",
          actor: actor.name,
          target: body.request_id ?? null,
          prompt: fill(QUESTION_SHARPEN, {
            question: body.question,
            contextAreas: body.contextAreas.join(", ") || "none selected",
          }),
          thinking: "medium",
        },
        Sharpen
      )
      return Response.json({ ...data, ai: meta })
    }

    const request = await getRequest(body.request_id)
    if (!request) return Response.json({ error: `There is no research request ${body.request_id}.` }, { status: 404 })
    const findings = await listFindings({ requestId: request.id })
    if (findings.length === 0) {
      return Response.json(
        { error: `There aren't enough findings in ${request.id} to suggest a follow-up question.` },
        { status: 422 }
      )
    }
    const { data, meta } = await generateJson(
      {
        action: "ai.followup_question",
        actor: actor.name,
        target: request.id,
        prompt: fill(FOLLOWUP_QUESTION, {
          question: request.question,
          findings: JSON.stringify(findings.map((f) => ({ text: f.text, limits: f.limits }))),
          contextAreas: request.context_areas.join(", ") || "none selected",
        }),
        thinking: "medium",
      },
      Followup
    )
    return Response.json({ ...data, draft: true, note: "AI draft — review before using.", ai: meta })
  } catch (err) {
    return routeError(err)
  }
}
