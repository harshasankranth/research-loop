import { actorFrom, logAudit } from "@/lib/audit"
import { pullCustomerSegment, ShopifyError } from "@/lib/shopify"

// Node, not edge: every pull is written to audit_log, which needs the database.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// Pull a filtered, anonymised customer segment. Until real credentials are
// added this returns hard-coded sample customers, flagged `simulated` in both
// the response and the audit log.
export async function GET(req: Request) {
  const actor = actorFrom(req)
  const filter = new URL(req.url).searchParams.get("filter")?.trim() || "orders_count:1"
  try {
    const { customers, simulated } = await pullCustomerSegment(filter)
    await logAudit({
      actor: actor.name,
      action: "shopify.pull_customers",
      target: "shopify",
      metadata: { simulated, filter, filter_applied: !simulated, count: customers.length },
    })
    return Response.json({ source: simulated ? "simulated" : "shopify", simulated, filter, customers })
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : "unknown error"
    await logAudit({
      actor: actor.name,
      action: "shopify.pull_customers",
      target: "shopify",
      metadata: { simulated: false, filter, ok: false, error: detail },
    })
    if (err instanceof ShopifyError) {
      return Response.json({ error: err.message, code: err.code }, { status: 502 })
    }
    return Response.json({ error: `Shopify couldn't be reached (${detail}).`, code: "request_failed" }, { status: 502 })
  }
}
