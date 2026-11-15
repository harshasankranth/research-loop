// gemini-embedding-001 at 768 dimensions (brief rule 6). Cosine similarity is
// scale-invariant, so the truncated vectors are stored as returned.
import { AiError, gemini, MODELS, toAiError } from "./ai"
import { logAudit } from "./audit"
import { EMBEDDING_DIMS } from "./schema"

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"

export interface EmbedOptions {
  task: EmbedTask
  actor?: string | null
  target?: string | null
}

export async function embedTexts(
  texts: string[],
  opts: EmbedOptions
): Promise<{ vectors: number[][]; latency_ms: number }> {
  if (texts.length === 0) return { vectors: [], latency_ms: 0 }
  const started = Date.now()
  try {
    const res = await gemini().models.embedContent({
      model: MODELS.embedding,
      contents: texts,
      config: {
        outputDimensionality: EMBEDDING_DIMS,
        taskType: opts.task,
        abortSignal: AbortSignal.timeout(20_000),
      },
    })
    const vectors = (res.embeddings ?? []).map((e) => e.values ?? [])
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMS)) {
      throw new AiError(`The embedding model didn't return ${EMBEDDING_DIMS}-dimension vectors for every text.`, 502)
    }
    const latency_ms = Date.now() - started
    await logAudit({
      actor: opts.actor,
      action: "ai.embed",
      target: opts.target,
      metadata: {
        ok: true,
        model: MODELS.embedding,
        dims: EMBEDDING_DIMS,
        task: opts.task,
        texts: texts.length,
        chars: texts.reduce((n, t) => n + t.length, 0),
        latency_ms,
      },
    })
    return { vectors, latency_ms }
  } catch (err) {
    const aiError = toAiError(err)
    await logAudit({
      actor: opts.actor,
      action: "ai.embed",
      target: opts.target,
      metadata: {
        ok: false,
        model: MODELS.embedding,
        task: opts.task,
        texts: texts.length,
        latency_ms: Date.now() - started,
        error: aiError.message,
      },
    })
    throw aiError
  }
}

export async function embedText(text: string, opts: EmbedOptions): Promise<{ vector: number[]; latency_ms: number }> {
  const { vectors, latency_ms } = await embedTexts([text], opts)
  return { vector: vectors[0], latency_ms }
}

/** pgvector text literal, e.g. "[0.1,0.2,…]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`
}
