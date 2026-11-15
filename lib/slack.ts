// Slack push connector (brief §14). The block format below is the brief's, exactly.
import { WebClient, type KnownBlock } from "@slack/web-api"
import { eq } from "drizzle-orm"
import { logAudit } from "./audit"
import { getDb, getRequest, listOutcomes } from "./db"
import { outcomes as outcomesTable } from "./schema"

export interface SlackRequest {
  id: string
  question: string
}

export interface SlackOutcome {
  kind: string
  description: string
  owner_name: string
  review_date: string
}

export const SLACK_CHANNEL = "#research"
// The link in the post follows the real production domain (set by Vercel), so it is right locally and deployed.
const APP_HOST = process.env.VERCEL_PROJECT_PRODUCTION_URL || "research-loop-woad.vercel.app"

export class SlackError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "SlackError"
    this.code = code
  }
}

export async function postOutcomeSummary(request: SlackRequest, outcomes: SlackOutcome[]) {
  if (!process.env.SLACK_BOT_TOKEN) {
    throw new SlackError("not_configured", "Slack isn't connected: SLACK_BOT_TOKEN is missing.")
  }
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN, { retryConfig: { retries: 1 }, timeout: 10_000 })
  const outcomeLines = outcomes
    .map(
      (o) =>
        `• *${o.kind.toUpperCase()}* — ${o.description}\n   _Owner:_ ${o.owner_name} · _Review:_ ${o.review_date}`
    )
    .join("\n")
  const blocks: KnownBlock[] = [
    // Slack caps header text at 150 characters.
    { type: "header", text: { type: "plain_text", text: `${request.id} closed — ${request.question}`.slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: outcomeLines } },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<https://${APP_HOST}/requests/${request.id}|Open in Research Loop>`,
        },
      ],
    },
  ]
  try {
    return await slack.chat.postMessage({ channel: SLACK_CHANNEL, blocks, text: `${request.id} closed` })
  } catch (err) {
    throw toSlackError(err)
  }
}

function toSlackError(err: unknown): SlackError {
  const code =
    typeof err === "object" && err !== null && "data" in err && typeof err.data === "object" && err.data !== null && "error" in err.data
      ? String(err.data.error)
      : "request_failed"
  const hints: Record<string, string> = {
    not_in_channel: `Slack refused the post: the bot isn't in ${SLACK_CHANNEL}. Invite it there, then post again.`,
    channel_not_found: `Slack refused the post: there is no ${SLACK_CHANNEL} channel the bot can see.`,
    invalid_auth: "Slack rejected the bot token. Check SLACK_BOT_TOKEN.",
    token_revoked: "Slack says the bot token was revoked. Check SLACK_BOT_TOKEN.",
    missing_scope: "Slack refused the post: the bot is missing the chat:write scope.",
  }
  return new SlackError(code, hints[code] ?? `Slack didn't accept the post (${code}).`)
}

/* ── Post a closed request's outcomes and record that they were posted ──── */


export interface SlackPostResult {
  ok: true
  channel: string
  ts: string | null
  outcomes_posted: number
}

/**
 * Guardrails: only a closed request with at least one outcome can be posted,
 * because the message header says "closed" and the body is the outcomes.
 */
export async function postRequestToSlack(requestId: string, actor: string): Promise<SlackPostResult> {
  const request = await getRequest(requestId)
  if (!request) throw new SlackError("not_found", `There is no research request ${requestId}.`)
  if (request.status !== "closed") {
    throw new SlackError("not_closed", `${requestId} isn't closed yet. Close it from the Decide step, then post.`)
  }
  const outcomes = await listOutcomes(requestId)
  if (outcomes.length === 0) throw new SlackError("no_outcomes", `${requestId} has no outcomes to post.`)
  try {
    const res = await postOutcomeSummary(request, outcomes)
    await getDb().update(outcomesTable).set({ posted_to_slack: true }).where(eq(outcomesTable.request_id, requestId))
    await logAudit({
      actor,
      action: "slack.post",
      target: requestId,
      metadata: { ok: true, channel: SLACK_CHANNEL, ts: res.ts ?? null, outcomes: outcomes.length },
    })
    return { ok: true, channel: SLACK_CHANNEL, ts: res.ts ?? null, outcomes_posted: outcomes.length }
  } catch (err) {
    const slackError = err instanceof SlackError ? err : new SlackError("request_failed", "Slack didn't accept the post.")
    await logAudit({
      actor,
      action: "slack.post",
      target: requestId,
      metadata: { ok: false, channel: SLACK_CHANNEL, error: slackError.code },
    })
    throw slackError
  }
}

const SLACK_STATUS: Record<string, number> = { not_found: 404, not_closed: 409, no_outcomes: 409, not_configured: 503 }

export function slackErrorResponse(err: SlackError): Response {
  return Response.json({ ok: false, error: err.message, code: err.code }, { status: SLACK_STATUS[err.code] ?? 502 })
}
