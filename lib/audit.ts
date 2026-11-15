import { getDb } from "./db"
import { audit_log } from "./schema"
import { DEFAULT_MEMBER, memberByName, type TeamMember } from "./utils"

export interface AuditEntry {
  actor?: string | null
  action: string
  target?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append one row to audit_log. Logging must never take a user action down with
 * it, so a failed insert is reported on the server console and swallowed.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb()
      .insert(audit_log)
      .values({
        actor: entry.actor ?? null,
        action: entry.action,
        target: entry.target ?? null,
        metadata: entry.metadata ?? null,
      })
  } catch (err) {
    console.error(`[audit] could not record "${entry.action}":`, err instanceof Error ? err.message : err)
  }
}

/**
 * The acting demo persona, taken from the x-rl-actor header our client sends.
 * This prototype has no sign-in: the role picker is the identity, so the header
 * is trusted only as far as naming one of the six seeded people.
 */
export function actorFrom(req: Request): TeamMember {
  return memberByName(req.headers.get("x-rl-actor")) ?? DEFAULT_MEMBER
}
