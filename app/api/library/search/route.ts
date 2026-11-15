import { z } from "zod"
import { routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { searchFindings, SIMILARITY } from "@/lib/rag"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const Body = z.object({
  query: z.string().trim().min(2, "type a few words to search").max(600),
  limit: z.number().int().min(1).max(20).default(8),
})

// pgvector semantic search over the findings Library.
export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())
    const { matches, embed_ms, search_ms } = await searchFindings(body.query, {
      limit: body.limit,
      actor: actor.name,
      target: "library",
    })
    return Response.json({
      results: matches,
      timing: { embed_ms, search_ms },
      close: SIMILARITY.close,
      weak: SIMILARITY.weak,
    })
  } catch (err) {
    return routeError(err)
  }
}
