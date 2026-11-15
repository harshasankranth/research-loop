import { EmptyState } from "@/components/WorkspaceBits"
import { getSummaryStats, type SummaryStats } from "@/lib/db"
import { errorMessage } from "@/lib/utils"

export const dynamic = "force-dynamic"

const NOT_ENOUGH = "Not enough data yet"

// CEO view: four numbers about whether the loop is working, and nothing else.
export default async function SummaryPage() {
  let s: SummaryStats
  try {
    s = await getSummaryStats()
  } catch (err) {
    return <EmptyState title="The summary couldn't be loaded.">{errorMessage(err)}</EmptyState>
  }

  const cards = [
    {
      label: "Median days to first conversation",
      value: s.median_first_days === null ? null : String(Math.round(s.median_first_days * 10) / 10),
      unit: "days",
      basis: `From ${s.first_days_sample} request${s.first_days_sample === 1 ? "" : "s"} that have had a conversation`,
    },
    {
      label: "Closed requests with an owned outcome",
      value: s.owned_outcome_pct === null ? null : `${s.owned_outcome_pct}%`,
      unit: "",
      basis: `${s.closed_with_outcome} of ${s.closed_requests} closed requests`,
    },
    {
      label: "Findings reused",
      value: String(s.findings_reused),
      unit: s.findings_reused === 1 ? "time" : "times",
      basis: "A new finding cross-referenced a past one, or a question was answered from the Library",
    },
    {
      label: "Team usefulness rating",
      value: s.usefulness_rating === null ? null : (Math.round(s.usefulness_rating * 10) / 10).toFixed(1),
      unit: "of 5",
      basis: `Rated by owners on ${s.rating_sample} closed request${s.rating_sample === 1 ? "" : "s"}`,
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-ink">
          Is the loop <span className="rl-serif text-[1.1em]">working?</span>
        </h1>
        <p className="rl-hint mt-2 max-w-[60ch]">
          Four numbers on the health of customer research at Everyday Goods. Read-only, calculated live from the
          requests.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <article key={c.label} className="rl-card flex flex-col gap-2 p-5">
            <p className="text-sm font-medium text-ink-2">{c.label}</p>
            {c.value === null ? (
              <p className="py-2 text-lg font-semibold text-ink">{NOT_ENOUGH}</p>
            ) : (
              <p className="text-[44px] leading-none font-bold tracking-[-0.03em] text-ink">
                {c.value}
                {c.unit && <span className="ml-2 text-base font-medium tracking-normal text-ink-2">{c.unit}</span>}
              </p>
            )}
            <p className="mt-auto pt-2 text-[13px] text-ink-3">{c.basis}</p>
          </article>
        ))}
      </div>

      <section className="rl-card p-6" aria-labelledby="not-shown">
        <p className="rl-mono text-accent-2">Deliberately not shown</p>
        <h2 id="not-shown" className="rl-h2 mt-2">
          Two numbers this page leaves out on purpose
        </h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm text-ink-2">
          <li>
            <span className="font-semibold text-ink">Conversation counts.</span> More conversations is not more
            learning. Counting them rewards talking, not deciding.
          </li>
          <li>
            <span className="font-semibold text-ink">Repeat-purchase attribution.</span> A handful of interviews
            can&apos;t prove what moved revenue, so no outcome here is credited with sales.
          </li>
        </ul>
      </section>
    </div>
  )
}
