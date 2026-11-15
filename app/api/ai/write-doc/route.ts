import { z } from "zod"
import { generate, generateJson, markdownToHtml, routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { getRequest, listFindings, listOutcomes } from "@/lib/db"
import { fill, INTERVIEW_GUIDE, INVITE_DRAFT, WRITE_DOC } from "@/lib/prompts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const Body = z.object({
  request_id: z.string(),
  // summary: closed-request research report. invite / guide: the Talk step's drafts.
  kind: z.enum(["summary", "invite", "guide"]).default("summary"),
  audience: z.string().trim().max(120).default("The whole Everyday Goods team"),
})

const Guide = z.object({ prompts: z.array(z.string()).min(1).max(8), avoid: z.array(z.string()).max(6) })

// Gemini writing drafts. Every response is a draft for a person to review;
// nothing is stored by this route.
export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())
    const request = await getRequest(body.request_id)
    if (!request) return Response.json({ error: `There is no research request ${body.request_id}.` }, { status: 404 })
    const contextAreas = request.context_areas.join(", ") || "none selected"

    if (body.kind === "invite") {
      const res = await generate({
        action: "ai.invite_draft",
        actor: actor.name,
        target: request.id,
        prompt: fill(INVITE_DRAFT, { contextAreas }),
        thinking: "low",
      })
      if (!res.text) return Response.json({ error: "Gemini returned an empty invite. Nothing was drafted." }, { status: 502 })
      return Response.json({ text: res.text, ai: res.meta })
    }

    if (body.kind === "guide") {
      const { data, meta } = await generateJson(
        {
          action: "ai.interview_guide",
          actor: actor.name,
          target: request.id,
          prompt: fill(INTERVIEW_GUIDE, { question: request.question, contextAreas }),
          thinking: "medium",
        },
        Guide
      )
      return Response.json({ ...data, ai: meta })
    }

    if (request.status !== "closed") {
      return Response.json(
        { error: `${request.id} isn't closed yet. The research report is written from a closed request.` },
        { status: 409 }
      )
    }
    const [findings, outcomes] = await Promise.all([listFindings({ requestId: request.id }), listOutcomes(request.id)])
    if (findings.length === 0) {
      return Response.json(
        { error: `There aren't enough findings in ${request.id} to write a research report.` },
        { status: 422 }
      )
    }
    const res = await generate({
      action: "ai.write_doc",
      actor: actor.name,
      target: request.id,
      prompt: fill(WRITE_DOC, {
        audience: body.audience,
        request: JSON.stringify({
          id: request.id,
          question: request.question,
          reason: request.reason,
          belief: request.belief,
          area: request.area,
          owner: request.owner_name,
        }),
        findings: JSON.stringify(
          findings.map((f) => ({ text: f.text, limits: f.limits, people: f.person_ids, echoes: f.echoes?.text ?? null }))
        ),
        outcomes: JSON.stringify(
          outcomes.map((o) => ({ kind: o.kind, description: o.description, owner: o.owner_name, review_date: o.review_date }))
        ),
      }),
      thinking: "medium",
    })
    if (!res.text) return Response.json({ error: "Gemini returned an empty document. Nothing was drafted." }, { status: 502 })
    return Response.json({
      markdown: res.text,
      html: markdownToHtml(res.text),
      inputs: { findings: findings.length, outcomes: outcomes.length },
      ai: res.meta,
    })
  } catch (err) {
    return routeError(err)
  }
}
