// Gemini gateway. Every text-model call in the app goes through generate(), which
// audit-logs input, output, model, actor, tokens and latency (brief §9, rule 5).
// Swapping the model is a one-line change here.
import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration } from "@google/genai"
import { ZodError, type ZodType } from "zod"
import { logAudit } from "./audit"
import { DbNotConfiguredError } from "./db"

/**
 * Pinned model versions (brief rule 11: never a "-latest" alias).
 *
 * text: the brief pins gemini-2.5-flash-preview-09-2025, which Google shut down
 * on 17 Feb 2026, and gemini-2.5-flash itself is closed to new API keys. Google's
 * deprecation table names gemini-3.5-flash-lite as the replacement for
 * gemini-2.5-flash, so that is what is pinned.
 * voice + embedding: exactly as the brief specifies; both still serve.
 */
export const MODELS = {
  text: "gemini-3.5-flash-lite",
  voice: "gemini-2.5-flash-native-audio-preview-09-2025",
  embedding: "gemini-embedding-001",
} as const

export class AiError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = "AiError"
    this.status = status
  }
}

let client: GoogleGenAI | null = null

export function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiError("Gemini isn't connected: GEMINI_API_KEY is missing.", 503)
  client ??= new GoogleGenAI({ apiKey })
  return client
}

/** What the "Show thinking" panel renders next to an AI output. */
export interface AiMeta {
  model: string
  latency_ms: number
  tokens: { prompt: number; output: number; thoughts: number; total: number }
  /** Gemini's own thought summary. Empty when the model returned none. */
  thinking: string
}

export interface AiFunctionCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

export interface GenerateOptions {
  /** audit_log.action, e.g. "ai.transcript_to_note" */
  action: string
  actor?: string | null
  target?: string | null
  prompt?: string
  contents?: Content[]
  system?: string
  json?: boolean
  tools?: FunctionDeclaration[]
  thinking?: "low" | "medium" | "high"
  /** Extra fields for audit_log.metadata. */
  audit?: Record<string, unknown>
}

export interface GenerateResult {
  text: string
  meta: AiMeta
  functionCalls: AiFunctionCall[]
  /** The model turn to append to a chat history (thought summaries removed). */
  modelContent: Content | null
}

const LEVELS = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const
const AUDIT_TEXT_LIMIT = 8000
const clip = (s: string) => (s.length > AUDIT_TEXT_LIMIT ? `${s.slice(0, AUDIT_TEXT_LIMIT)}… [truncated]` : s)

export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err
  const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 0
  const name = err instanceof Error ? err.name : ""
  if (status === 429) return new AiError("Gemini is rate-limited right now, so nothing was drafted. Try again in a moment.", 429)
  if (status === 503) return new AiError("Gemini is overloaded right now, so nothing was drafted. Try again in a moment.", 503)
  if (name === "TimeoutError" || name === "AbortError") return new AiError("Gemini took too long to answer, so nothing was drafted. Try again.", 504)
  if (status === 401 || status === 403) return new AiError("Gemini rejected the API key. Check GEMINI_API_KEY.", 503)
  const detail = err instanceof Error ? err.message.slice(0, 200) : "unknown error"
  return new AiError(`Gemini couldn't answer (${detail}). Nothing was drafted.`, 502)
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const started = Date.now()
  const input = opts.prompt ?? JSON.stringify(opts.contents ?? [])
  try {
    const res = await gemini().models.generateContent({
      model: MODELS.text,
      contents: opts.contents ?? opts.prompt ?? "",
      config: {
        systemInstruction: opts.system,
        responseMimeType: opts.json ? "application/json" : undefined,
        thinkingConfig: { includeThoughts: true, thinkingLevel: LEVELS[opts.thinking ?? "medium"] },
        tools: opts.tools?.length ? [{ functionDeclarations: opts.tools }] : undefined,
        abortSignal: AbortSignal.timeout(45_000),
      },
    })
    const content = res.candidates?.[0]?.content ?? null
    const parts = content?.parts ?? []
    const thinking = parts
      .filter((p) => p.thought && p.text)
      .map((p) => p.text)
      .join("\n")
      .trim()
    const text = parts
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join("")
      .trim()
    const functionCalls: AiFunctionCall[] = parts
      .filter((p) => p.functionCall?.name)
      .map((p) => ({
        id: p.functionCall?.id,
        name: p.functionCall?.name ?? "",
        args: (p.functionCall?.args ?? {}) as Record<string, unknown>,
      }))
    const usage = res.usageMetadata
    const meta: AiMeta = {
      model: MODELS.text,
      latency_ms: Date.now() - started,
      tokens: {
        prompt: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0,
        thoughts: usage?.thoughtsTokenCount ?? 0,
        total: usage?.totalTokenCount ?? 0,
      },
      thinking,
    }
    await logAudit({
      actor: opts.actor,
      action: opts.action,
      target: opts.target,
      metadata: {
        ok: true,
        model: meta.model,
        served_model: res.modelVersion ?? null,
        latency_ms: meta.latency_ms,
        tokens: meta.tokens,
        input: clip(input),
        output: clip(text || JSON.stringify(functionCalls)),
        ...opts.audit,
      },
    })
    return {
      text,
      meta,
      functionCalls,
      // Keep thought signatures (Gemini needs them back on tool turns); drop thought summaries.
      modelContent: content ? { role: content.role ?? "model", parts: parts.filter((p) => !p.thought) } : null,
    }
  } catch (err) {
    const aiError = toAiError(err)
    await logAudit({
      actor: opts.actor,
      action: opts.action,
      target: opts.target,
      metadata: {
        ok: false,
        model: MODELS.text,
        latency_ms: Date.now() - started,
        input: clip(input),
        error: aiError.message,
        ...opts.audit,
      },
    })
    throw aiError
  }
}

const UNREADABLE = "Gemini replied, but not in a shape Research Loop could read. Nothing was drafted."

/** generate() in JSON mode, validated against a zod schema. */
export async function generateJson<T>(opts: GenerateOptions, schema: ZodType<T>): Promise<{ data: T; meta: AiMeta }> {
  const res = await generate({ ...opts, json: true })
  let parsed: unknown
  try {
    parsed = JSON.parse(res.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))
  } catch {
    throw new AiError(UNREADABLE, 502)
  }
  const checked = schema.safeParse(parsed)
  if (!checked.success) throw new AiError(UNREADABLE, 502)
  return { data: checked.data, meta: res.meta }
}

/** Turn anything thrown inside a Node route handler into a plain JSON error. */
export function routeError(err: unknown): Response {
  if (err instanceof AiError) return Response.json({ error: err.message }, { status: err.status })
  if (err instanceof DbNotConfiguredError) return Response.json({ error: err.message }, { status: 503 })
  if (err instanceof ZodError) {
    const first = err.issues[0]
    const where = first?.path.length ? `${first.path.join(".")}: ` : ""
    return Response.json({ error: `Invalid request — ${where}${first?.message ?? "bad input"}` }, { status: 400 })
  }
  if (err instanceof SyntaxError) return Response.json({ error: "Invalid request — body must be JSON." }, { status: 400 })
  console.error("[route]", err)
  const detail = err instanceof Error ? err.message.slice(0, 200) : "unknown error"
  return Response.json({ error: `Something went wrong on the server (${detail}).` }, { status: 500 })
}

/* ── Closed-request summary doc (WRITE_DOC) ─────────────────────────────── */

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const inlineMd = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")

/** Small Markdown → HTML pass for the doc editor: headings, lists, quotes, paragraphs. */
export function markdownToHtml(markdown: string): string {
  const out: string[] = []
  let list: "ul" | "ol" | null = null
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim()
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const bullet = line.match(/^[-*]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol"
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li><p>${inlineMd((bullet ?? numbered)![1])}</p></li>`)
      continue
    }
    closeList()
    if (!line) continue
    if (heading) out.push(`<h${heading[1].length}>${inlineMd(heading[2])}</h${heading[1].length}>`)
    else if (line.startsWith(">")) out.push(`<blockquote><p>${inlineMd(line.replace(/^>\s?/, ""))}</p></blockquote>`)
    else if (/^(-{3,}|\*{3,})$/.test(line)) out.push("<hr>")
    else out.push(`<p>${inlineMd(line)}</p>`)
  }
  closeList()
  return out.join("")
}
