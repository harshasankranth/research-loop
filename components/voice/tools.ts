// The assistant's five tools (brief §13, rule 7). Voice and text chat share
// this one list and this one set of handlers.
import { api, errorMessage, STEPS, type Step } from "@/lib/utils"

export const TOOLS = [
  { name: 'lookup_request', description: 'Get current state of a research request', parameters: { type:'object', properties:{ request_id:{type:'string'}}, required:['request_id']}},
  { name: 'search_findings_rag', description: 'Semantic search of library', parameters: { type:'object', properties:{ query:{type:'string'}}, required:['query']}},
  { name: 'navigate_to_step', description: 'Navigate the UI to a specific step', parameters: { type:'object', properties:{ request_id:{type:'string'}, step:{type:'string', enum:['question','people','talk','capture','decide']}}, required:['request_id','step']}},
  { name: 'post_outcome_to_slack', description: 'Post request outcome summary to #research', parameters: { type:'object', properties:{ request_id:{type:'string'}}, required:['request_id']}},
  { name: 'suggest_followup_question', description: 'Draft one follow-up question for a request', parameters: { type:'object', properties:{ request_id:{type:'string'}}, required:['request_id']}},
];

export type ToolName = 'lookup_request' | 'search_findings_rag' | 'navigate_to_step' | 'post_outcome_to_slack' | 'suggest_followup_question'

interface ToolRouter {
  push: (href: string) => void
}

let router: ToolRouter | null = null

/** Providers hands us the Next.js app router so navigate_to_step can use it. */
export function setToolRouter(next: ToolRouter | null) {
  router = next
}

type Args = Record<string, unknown>
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

export const handlers: Record<ToolName, (args: Args) => Promise<unknown>> = {
  lookup_request: async ({ request_id }) => api(`/api/requests/${encodeURIComponent(str(request_id))}`),
  search_findings_rag: async ({ query }) => {
    const res = await api<{ results: { text: string; source: string | null; source_kind: string; limits: string | null; similarity: number; request_id: string | null }[] }>(
      '/api/library/search',
      { body: { query: str(query), limit: 5 } }
    )
    // Trimmed for the model: what was found, where it came from, how close it is.
    return {
      results: res.results.map((r) => ({
        text: r.text,
        source: r.source_kind === "unknown" ? "Source unknown" : r.source,
        source_kind: r.source_kind,
        limits: r.limits,
        request_id: r.request_id,
        similarity: Number(r.similarity.toFixed(2)),
      })),
    }
  },
  navigate_to_step: async ({ request_id, step }) => {
    const id = str(request_id)
    if (!STEPS.includes(str(step) as Step)) return { ok: false, error: `Unknown step "${str(step)}".` }
    if (!router) return { ok: false, error: "Navigation isn't available right now." }
    // Check the request exists before sending the user to a 404.
    await api(`/api/requests/${encodeURIComponent(id)}`)
    router.push(`/requests/${id}/${str(step)}`)
    return { ok: true }
  },
  post_outcome_to_slack: async ({ request_id }) => api('/api/slack/post', { body: { request_id: str(request_id) } }),
  suggest_followup_question: async ({ request_id }) => api('/api/ai/question-sharpen', { body: { request_id: str(request_id) } }),
};

/** Run one tool call. Failures come back as data so the model can say so plainly. */
export async function runTool(name: string, args: Args): Promise<{ ok: boolean; result: unknown }> {
  const handler = (handlers as Record<string, ((args: Args) => Promise<unknown>) | undefined>)[name]
  if (!handler) return { ok: false, result: { error: `There is no tool called ${name}.` } }
  try {
    return { ok: true, result: await handler(args ?? {}) }
  } catch (err) {
    return { ok: false, result: { error: errorMessage(err) } }
  }
}

/** Gemini's wire schema wants upper-case type names; TOOLS stays as the brief wrote it. */
export function toGeminiSchema<T>(value: T): T {
  if (Array.isArray(value)) return value.map(toGeminiSchema) as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGeminiSchema(v)
    }
    return out as T
  }
  return value
}
