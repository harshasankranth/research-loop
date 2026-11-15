import { shopifyConfigured } from "@/lib/shopify"

export const dynamic = "force-dynamic"

interface Tile {
  name: string
  category: string
  direction: string
  body: string
  live: boolean
  connected?: boolean
  /** Shown instead of the "credentials are missing" line when a connector is stubbed. */
  fallback?: string
}

// Eight connectors. Slack and Shopify are wired; the other six are shown as the
// same pattern and call no APIs (brief rule 16).
function tiles(): Tile[] {
  return [
    {
      name: "Slack",
      category: "Push",
      direction: "Research Loop → Slack",
      body: "Posts a closed request's outcomes, owners and review dates to #research.",
      live: true,
      connected: Boolean(process.env.SLACK_BOT_TOKEN),
    },
    {
      name: "Shopify",
      category: "Pull",
      direction: "Shopify → Research Loop",
      body: "Pulls a filtered customer segment as coded IDs. Never names, emails or phone numbers.",
      live: true,
      connected: shopifyConfigured(),
      fallback: "Simulated: returns sample customers until store credentials are added.",
    },
    { name: "Linear", category: "Push", direction: "Research Loop → Linear", body: "Turn an experiment outcome into a ticket for the owning team.", live: false },
    { name: "Notion", category: "Push", direction: "Research Loop → Notion", body: "Publish a reviewed research report to the team wiki.", live: false },
    { name: "Zendesk", category: "Pull", direction: "Zendesk → Research Loop", body: "Bring recurring support themes into the Library as sourced findings.", live: false },
    { name: "Gmail", category: "Push", direction: "Research Loop → Gmail", body: "Send a reviewed invite from the owner's own inbox.", live: false },
    { name: "Drive", category: "Pull", direction: "Drive → Research Loop", body: "Import past studies so old findings keep their source.", live: false },
    { name: "Cal.com", category: "Pull", direction: "Cal.com → Research Loop", body: "Move a person to Scheduled when they book a slot.", live: false },
  ]
}

export default function SourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-ink">
          Sources &amp; <span className="rl-serif text-[1.1em]">destinations</span>
        </h1>
        <p className="rl-hint mt-2 max-w-[62ch]">
          Outcomes go to where teams already work, so nobody logs in to a second tool. Two connectors are live. The
          rest follow the same pattern through the same gateway — more connectors, no new architecture.
        </p>
      </div>

      <p className="rl-card border-l-2 border-l-accent px-5 py-4 text-sm text-ink-2" role="note">
        <span className="font-semibold text-ink">Operations &amp; data support role (Ravi):</span> configures
        integrations, imports controlled customer lists, monitors access log. Shopify MCP shown live below; other
        sources are UI-only patterns.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles().map((t) => (
          <article key={t.name} className="rl-card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={
                  t.live
                    ? "grid size-9 place-items-center rounded-[10px] bg-accent text-base font-bold text-accent-ink"
                    : "grid size-9 place-items-center rounded-[10px] bg-accent-soft text-base font-bold text-accent-2"
                }
              >
                {t.name[0]}
              </span>
              <span className="rl-tag ml-auto" data-tone={t.live ? "accent" : undefined}>
                {t.live && <span className="rl-live-dot" />}
                {t.live ? "Live" : "Pattern"}
              </span>
            </div>
            <h2 className="rl-card-title">{t.name}</h2>
            <p className="rl-mono">
              {t.category} · {t.direction}
            </p>
            <p className="text-sm text-ink-2">{t.body}</p>
            <p className="mt-auto pt-1 text-[13px] text-ink-2">
              {t.live
                ? t.connected
                  ? "Connected."
                  : (t.fallback ?? "Wired, but not connected: credentials are missing.")
                : "Not connected. Shown as a pattern only."}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
