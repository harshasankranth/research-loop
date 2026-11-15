import { z } from "zod"
import { generateJson, routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { getRequest, listPeople } from "@/lib/db"
import { fill, TRANSCRIPT_TO_NOTE } from "@/lib/prompts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const MIN_WORDS = 15

const Body = z.object({
  request_id: z.string(),
  person_id: z.string(),
  transcript: z.string().max(60_000, "that transcript is too long to draft from in one go"),
})

const Draft = z.object({
  points: z.array(z.object({ content: z.string().trim().min(1), kind: z.enum(["words", "interpretation"]) })).max(30),
})

/** Lower-case, straighten quotes, drop punctuation and collapse whitespace. */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”"]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

// Transcript → draft note. Nothing is saved here: the draft goes back to the
// browser and only an explicit approval writes it (POST /api/requests/[id]/notes).
export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())
    const request = await getRequest(body.request_id)
    if (!request) return Response.json({ error: `There is no research request ${body.request_id}.` }, { status: 404 })
    const person = (await listPeople(request.id)).find((p) => p.id === body.person_id)
    if (!person) return Response.json({ error: `${body.person_id} isn't part of ${request.id}.` }, { status: 404 })
    if (!person.consent_recorded) {
      return Response.json({ error: `${person.id} has no consent on record, so their transcript can't be used.` }, { status: 409 })
    }
    const transcript = body.transcript.trim()
    if (transcript.split(/\s+/).filter(Boolean).length < MIN_WORDS) {
      return Response.json({ error: "There isn't enough transcript here to draft a note." }, { status: 422 })
    }

    const { data, meta } = await generateJson(
      {
        action: "ai.transcript_to_note",
        actor: actor.name,
        target: request.id,
        prompt: fill(TRANSCRIPT_TO_NOTE, {
          transcript,
          customerInfo: JSON.stringify({
            id: person.id,
            channel: person.channel,
            segment: person.segment,
            product: person.product,
            first_order_days_ago: person.first_order_days_ago,
          }),
          question: request.question,
          contextAreas: request.context_areas.join(", ") || "none selected",
        }),
        thinking: "medium",
        audit: { person_id: person.id },
      },
      Draft
    )

    // Guardrail: check every "words" point really is in the transcript.
    const haystack = normalise(transcript)
    const points = data.points.map((p) => {
      // The chip already says which kind a point is, so drop a leading "Interpretation:" label.
      const content =
        p.kind === "words"
          ? p.content.replace(/^["“'‘]+|["”'’]+$/g, "").trim()
          : p.content.replace(/^interpretation\s*[:—-]\s*/i, "")
      return { content, kind: p.kind, verbatim: p.kind === "words" ? haystack.includes(normalise(content)) : null }
    })
    return Response.json({ points, ai: meta })
  } catch (err) {
    return routeError(err)
  }
}
