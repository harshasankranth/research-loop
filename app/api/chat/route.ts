import type { Content, FunctionDeclaration } from "@google/genai"
import { z } from "zod"
import { TOOLS, toGeminiSchema } from "@/components/voice/tools"
import { generate, routeError } from "@/lib/ai"
import { actorFrom } from "@/lib/audit"
import { listRequests } from "@/lib/db"
import { voiceSystem } from "@/lib/prompts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const Body = z.object({
  contents: z.array(z.object({ role: z.string().optional(), parts: z.array(z.record(z.string(), z.unknown())) })).min(1).max(60),
  context: z
    .object({ path: z.string().max(200).optional(), context_areas: z.array(z.string().max(80)).max(20).optional() })
    .optional(),
})

// Text chat (⌘K palette, home chat box, voice fallback). One model turn per call:
// the browser runs any tool calls with the same handlers the voice call uses and
// posts the results back, so all five tools behave identically in both modes.
export async function POST(req: Request) {
  try {
    const actor = actorFrom(req)
    const body = Body.parse(await req.json())
    const context = [
      "Mode: text chat (the user is typing, not speaking).",
      "When you cite a finding, say where it comes from. If its source is unknown, say \"source unknown\" — never guess one.",
      `Current user: ${actor.name} (${actor.title}).`,
      body.context?.path ? `Current page: ${body.context.path}.` : "",
      body.context?.context_areas?.length ? `Selected context areas: ${body.context.context_areas.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n")

    const res = await generate({
      action: "ai.chat",
      actor: actor.name,
      target: body.context?.path ?? null,
      // Read fresh on every turn, so a request created a second ago is already listed.
      system: `${voiceSystem(await listRequests().catch(() => null))}\n\n${context}`,
      contents: body.contents as Content[],
      tools: toGeminiSchema(TOOLS) as unknown as FunctionDeclaration[],
      thinking: "low",
    })
    return Response.json({
      text: res.text,
      functionCalls: res.functionCalls,
      modelContent: res.modelContent,
      ai: res.meta,
    })
  } catch (err) {
    return routeError(err)
  }
}
