import { z } from "zod"
import { generateJson, routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { getFindingsByIds, getRequest, listNotes } from "@/lib/db"
import { embedTexts } from "@/lib/embeddings"
import { fill, SUGGEST_FINDINGS } from "@/lib/prompts"
import { nearestFindings, searchFindings } from "@/lib/rag"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const Body = z.object({ request_id: z.string() })

const Suggested = z.object({
  findings: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        linked_note_ids: z.array(z.string()).default([]),
        limits: z.string().trim().default(""),
        echoes_past_finding_id: z.string().nullable().optional(),
      })
    )
    .max(5),
})

/** Doc-to-doc similarity above which a draft is "probably already saved here". */
const ALREADY_SAVED = 0.88

// Notes + top-5 similar past findings (pgvector) → draft findings. Drafts only:
// each one is saved separately, by a person, via POST /api/requests/[id]/findings.
export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    const { request_id } = Body.parse(await req.json())
    const request = await getRequest(request_id)
    if (!request) return Response.json({ error: `There is no research request ${request_id}.` }, { status: 404 })
    const notes = await listNotes(request.id)
    if (notes.length === 0) {
      return Response.json({ error: "There aren't enough notes here to suggest findings." }, { status: 422 })
    }

    const notesForPrompt = notes.map((n) => ({
      note_id: n.id,
      person: n.person_id,
      points: n.points.map((p) => ({ kind: p.kind, content: p.content })),
    }))
    const notesText = notes.flatMap((n) => n.points.map((p) => p.content)).join("\n")

    // RAG: past findings = everything in the Library that isn't from this request.
    const rag = await searchFindings(`${request.question}\n${notesText}`.slice(0, 6000), {
      limit: 5,
      excludeRequestId: request.id,
      actor: actor.name,
      target: request.id,
    })

    const { data, meta } = await generateJson(
      {
        action: "ai.suggest_findings",
        actor: actor.name,
        target: request.id,
        prompt: fill(SUGGEST_FINDINGS, {
          notesWithIds: JSON.stringify(notesForPrompt),
          pastFindings: rag.matches.length
            ? JSON.stringify(
                rag.matches.map((m) => ({
                  id: m.id,
                  text: m.text,
                  source: m.source_kind === "unknown" ? "Source unknown" : m.source,
                  limits: m.limits,
                }))
              )
            : "none found",
        }),
        thinking: "high",
        audit: { notes: notes.length, rag_matches: rag.matches.map((m) => m.id) },
      },
      Suggested
    )

    // Guardrails: a draft must point at real notes of this request, and an echo
    // must point at a finding the model was actually shown.
    const noteIds = new Set(notes.map((n) => n.id))
    const pastById = new Map(rag.matches.map((m) => [m.id, m]))
    const personByNote = new Map(notes.map((n) => [n.id, n.person_id]))
    const kept = data.findings
      .map((f) => ({ ...f, linked_note_ids: [...new Set(f.linked_note_ids.filter((id) => noteIds.has(id)))] }))
      .filter((f) => f.linked_note_ids.length > 0)
    const dropped = data.findings.length - kept.length

    // Flag drafts that restate something already saved on this request.
    const similar: ({ id: string; text: string; similarity: number } | null)[] = kept.map(() => null)
    if (kept.length > 0) {
      const { vectors } = await embedTexts(
        kept.map((f) => f.text),
        { task: "RETRIEVAL_DOCUMENT", actor: actor.name, target: request.id }
      )
      const nearest = await Promise.all(vectors.map((v) => nearestFindings(v, { limit: 1, onlyRequestId: request.id })))
      const hits = nearest.map((n) => n[0]).filter((n) => n && n.similarity >= ALREADY_SAVED)
      const saved = await getFindingsByIds(hits.map((h) => h.id))
      nearest.forEach((n, i) => {
        const top = n[0]
        const match = top && top.similarity >= ALREADY_SAVED ? saved.find((s) => s.id === top.id) : undefined
        if (top && match) similar[i] = { id: match.id, text: match.text, similarity: top.similarity }
      })
    }

    return Response.json({
      findings: kept.map((f, i) => {
        const echo = f.echoes_past_finding_id ? pastById.get(f.echoes_past_finding_id) : undefined
        return {
          text: f.text,
          limits: f.limits,
          linked_note_ids: f.linked_note_ids,
          linked_people: [...new Set(f.linked_note_ids.map((id) => personByNote.get(id)).filter(Boolean))].sort(),
          echoes: echo
            ? { id: echo.id, text: echo.text, source: echo.source, source_kind: echo.source_kind, request_id: echo.request_id }
            : null,
          similar_saved: similar[i],
        }
      }),
      dropped_unlinked: dropped,
      rag: {
        matches: rag.matches.map((m) => ({ id: m.id, text: m.text, source_kind: m.source_kind, similarity: m.similarity })),
        embed_ms: rag.embed_ms,
        search_ms: rag.search_ms,
      },
      notes_used: notes.length,
      ai: meta,
    })
  } catch (err) {
    return routeError(err)
  }
}
