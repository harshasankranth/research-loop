import { desc, eq } from "drizzle-orm"
import { EmptyState } from "@/components/WorkspaceBits"
import { getDb, listPeople, listRequests } from "@/lib/db"
import { audit_log } from "@/lib/schema"
import { errorMessage } from "@/lib/utils"
import { OpsDashboard, type AccessRow, type NeedsList } from "./OpsDashboard"

export const dynamic = "force-dynamic"

// Ops dashboard (Ravi): which requests still need a customer list, a way to
// import one, and the log of who revealed which contact.
export default async function OpsPage() {
  let needs: NeedsList[]
  let access: AccessRow[]
  try {
    const [all, reveals] = await Promise.all([
      listRequests(),
      getDb()
        .select()
        .from(audit_log)
        .where(eq(audit_log.action, "contact.reveal"))
        .orderBy(desc(audit_log.created_at))
        .limit(50),
    ])
    // "Needs a list" = still open and nobody shortlisted yet.
    const counts = await Promise.all(all.map(async (r) => ({ r, people: r.status === "open" ? await peopleCount(r.id) : -1 })))
    needs = counts
      .filter((c) => c.people === 0)
      .map(({ r }) => ({ id: r.id, question: r.question, owner_name: r.owner_name, area: r.area }))
    access = reveals.map((row) => {
      const meta = (row.metadata ?? {}) as { request_id?: string; role?: string }
      return {
        id: String(row.id),
        at: row.created_at ? new Date(row.created_at).toISOString() : null,
        actor: row.actor ?? "Unknown",
        role: meta.role ?? null,
        person: row.target ?? "Unknown",
        request_id: meta.request_id ?? null,
      }
    })
  } catch (err) {
    return <EmptyState title="The Ops dashboard couldn't be loaded.">{errorMessage(err)}</EmptyState>
  }
  return <OpsDashboard needs={needs} access={access} />
}

async function peopleCount(requestId: string): Promise<number> {
  return (await listPeople(requestId)).length
}
