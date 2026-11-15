import { GoogleGenAI } from '@google/genai';
import { MODELS, routeError, toAiError } from '@/lib/ai';
import { actorFrom, logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Single-use ephemeral token so the browser can open a Gemini Live session
// without ever seeing GEMINI_API_KEY.
export async function POST(req: Request) {
  const actor = actorFrom(req);
  const started = Date.now();
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: "Gemini isn't connected: GEMINI_API_KEY is missing." }, { status: 503 });
    }
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
      httpOptions: { apiVersion: 'v1alpha' }
    });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString()
      }
    });
    await logAudit({
      actor: actor.name,
      action: 'ai.voice_session',
      metadata: { ok: true, model: MODELS.voice, latency_ms: Date.now() - started },
    });
    return Response.json({ token: token.name });
  } catch (err) {
    const aiError = toAiError(err);
    await logAudit({
      actor: actor.name,
      action: 'ai.voice_session',
      metadata: { ok: false, model: MODELS.voice, latency_ms: Date.now() - started, error: aiError.message },
    });
    return routeError(aiError);
  }
}
