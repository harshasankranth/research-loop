// All Gemini prompts (brief §12). Templates use {{placeholders}}; fill() swaps them in.

export const QUESTION_SHARPEN = `You review a research question and reply JSON.
Question: {{question}}
Context areas: {{contextAreas}}

Return: { "verdict": "clear" | "sharpen", "note": "<one sentence>" }
Never state the answer. Only improve the question. If it contains loaded belief words ("expensive", "want X") suggest reframing.`;

export const INVITE_DRAFT = `Draft a warm 80-word invite from Anita (Growth lead) to a customer (coded ID, no real name) for a 20-minute chat about shampoo purchase. Mention consent. No compensation promise.
Context areas: {{contextAreas}}
Return plain text.`;

export const INTERVIEW_GUIDE = `Generate a 20-minute interview guide. Return JSON:
{
  "prompts": ["<4 open prompts starting with Tell me / Walk me through / What did you do>"],
  "avoid":   ["<2 leading questions as warnings>"]
}
Question: {{question}}
Context areas: {{contextAreas}}
Rules: no yes/no, no leading, no mention of competitor names.`;

export const TRANSCRIPT_TO_NOTE = `Draft a structured note from a transcript. Separate points into "words" (verbatim quote) or "interpretation" (your reading).

RULES:
- "words" points must be verbatim from transcript, never paraphrased
- "interpretation" points must be clearly labelled as reading, not fact
- If transcript is sparse, draft fewer points. Never invent.

Transcript: {{transcript}}
Customer info: {{customerInfo}}
Question: {{question}}
Context areas: {{contextAreas}}

Return JSON: { "points": [{ "content": "...", "kind": "words" | "interpretation" }] }`;

export const SUGGEST_FINDINGS = `Suggest up to 5 findings from notes. Each finding MUST:
- link to at least one note_id
- state its limits (sample size, bias, what it can't prove)
- flag if it echoes a past finding by meaning

Never invent. If notes don't support it, don't draft it.

Current notes: {{notesWithIds}}
Similar past findings (RAG, top 5): {{pastFindings}}

Return JSON: {
  "findings": [{
    "text": "...",
    "linked_note_ids": ["..."],
    "limits": "...",
    "echoes_past_finding_id": "..." | null
  }]
}`;

export const WRITE_DOC = `Write a concise research summary for a closed request. Markdown.
Audience: {{audience}}
Sections: 1) The question  2) What we learned (3-5 findings with limits)  3) What we're doing about it (outcomes with owners and dates)  4) What we're NOT claiming

Never inflate. Never generalize beyond sample.
Request: {{request}}
Findings: {{findings}}
Outcomes: {{outcomes}}`;

export const VOICE_SYSTEM = `You are the voice assistant for Research Loop at Everyday Goods (shampoo, body wash, moisturiser).

Speak naturally, warmly, like a research colleague. 1-2 sentences per turn. Never monologue.

Tools available:
- lookup_request(request_id): get a request's current state
- search_findings_rag(query): semantic search of library
- navigate_to_step(request_id, step): navigate the UI
- post_outcome_to_slack(request_id): post summary to #research
- suggest_followup_question(request_id): draft one next question

Live requests: {{liveRequests}}

RULES:
- The list above was read when this session started. Requests are created and changed all the time, so it may be out of date and may be missing new ones.
- Before saying anything about a request's state, ALWAYS call lookup_request for it, every time, even if you looked it up a moment ago and even if its ID is not in the list. Never answer from the list or from memory.
- Only say a request doesn't exist if lookup_request says so.
- Never fabricate findings or quotes. Say "I don't know" if you don't.
- Confirm briefly before/after any navigate or post action.
- You never know real customer names, only coded IDs (P-01, C-1042).
- If asked "what should we test", prefer to look up findings and summarize, not guess.`;

/**
 * The brief hard-codes "Live requests: R-003…, R-002, R-001" in VOICE_SYSTEM,
 * which made the assistant blind to anything created later. The line is now
 * filled from the database each time a voice call or chat turn starts.
 */
export function voiceSystem(
  live: { id: string; area: string | null; status: string; current_step: string }[] | null
): string {
  const liveRequests =
    live === null
      ? "unavailable right now. Use lookup_request."
      : live.length === 0
        ? "none yet."
        : live
            .map((r) => {
              const open = r.status === "open"
              const step = r.current_step.charAt(0).toUpperCase() + r.current_step.slice(1)
              return `${r.id} (${(r.area ?? "no area").toLowerCase()}, ${r.status.toUpperCase()}${open ? `, step ${step}` : ""})`
            })
            .join(", ") + "."
  return fill(VOICE_SYSTEM, { liveRequests })
}

// Not in the brief's §12: the suggest_followup_question voice tool (§13) posts a
// request_id to /api/ai/question-sharpen, which needs a prompt of its own.
export const FOLLOWUP_QUESTION = `Draft one follow-up research question for a request and reply JSON.
Request question: {{question}}
Findings so far, with their limits: {{findings}}
Context areas: {{contextAreas}}

Return: { "question": "<one open question>", "why": "<one sentence naming the finding or limit it follows from>" }
Never state an answer. No yes/no questions. Build only on the findings given. If there are no findings, return an empty "question" and say so in "why".`;

/** Replace {{name}} placeholders. Unknown placeholders are left visible on purpose. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}
