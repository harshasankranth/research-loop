"use client"

import { useEffect, useRef, useState } from "react"

/* ── Shared bits ────────────────────────────────────────────────────────── */

function Sparkle({ size = 28, className = "", style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 40 40" width={size} height={size} className={className} style={style}>
      <path className="ld-spark" fill="var(--accent-2)" d="M20 0c1.6 11.6 6.8 16.8 20 20-13.2 3.2-18.400 8.400-20 20C18.400 28.400 13.200 23.200 0 20 13.200 16.800 18.400 11.600 20 0Z" />
    </svg>
  )
}

function XpWindow({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // Tilt toward the cursor.
  const tilt = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const b = el.getBoundingClientRect()
    el.style.setProperty("--rx", String((((e.clientX - b.left) / b.width) * 2 - 1) * 5))
    el.style.setProperty("--ry", String((((e.clientY - b.top) / b.height) * 2 - 1) * -5))
  }
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0")
    ref.current?.style.setProperty("--ry", "0")
  }
  return (
    <div ref={ref} className={`ld-window ${className}`} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="ld-titlebar">
        <span aria-hidden className="ld-glass-dot" />
        <span className="truncate">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/** Types `text` out one character at a time; restarts whenever `text` or `run` changes. */
function useTyped(text: string, run: number, speed = 18) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length)
      return
    }
    setN(0)
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(id)
          return v
        }
        return v + 1
      })
    }, speed)
    return () => window.clearInterval(id)
  }, [text, run, speed])
  return { shown: text.slice(0, n), done: n >= text.length }
}

function DraftChip() {
  return (
    <span className="rl-tag self-start" data-tone="accent">
      AI draft
    </span>
  )
}

/* ── Hero scene ─────────────────────────────────────────────────────────── */

export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null)
  const typed = useTyped("Why don't first-time shampoo buyers buy again?", 0, 42)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      el.style.setProperty("--mx", String((e.clientX / window.innerWidth) * 2 - 1))
      el.style.setProperty("--my", String((e.clientY / window.innerHeight) * 2 - 1))
    }
    window.addEventListener("pointermove", move, { passive: true })
    return () => window.removeEventListener("pointermove", move)
  }, [])

  return (
    <div ref={ref} className="ld-scene" aria-hidden>
      {/* Orbit rings */}
      <svg viewBox="0 0 440 440" className="absolute inset-0 m-auto h-full max-w-full">
        <g className="ld-ring">
          <ellipse cx="220" cy="220" rx="200" ry="92" fill="none" stroke="var(--line-2)" strokeDasharray="3 7" transform="rotate(-18 220 220)" />
          <circle cx="412" cy="170" r="5" fill="var(--accent)" />
        </g>
        <g className="ld-ring-rev">
          <ellipse cx="220" cy="220" rx="170" ry="150" fill="none" stroke="var(--line-2)" strokeDasharray="2 9" transform="rotate(24 220 220)" />
          <circle cx="76" cy="150" r="4" fill="var(--accent)" />
          <circle cx="330" cy="352" r="3" fill="var(--accent)" />
        </g>
      </svg>

      {/* Huge Y2K star behind a medium sphere */}
      <div className="ld-float" style={{ right: "2%", top: "4%", ["--depth" as string]: 10 }}>
        <Sparkle size={250} className="ld-glow ld-big" />
      </div>
      <div className="ld-float" style={{ left: "44%", top: "52%", ["--depth" as string]: 18 }}>
        <div className="ld-orb ld-bob" style={{ width: 130, height: 130 }} />
      </div>
      <div className="ld-float" style={{ right: "6%", bottom: "6%", ["--depth" as string]: 26 }}>
        <div className="ld-chrome ld-bob-slow" style={{ width: 54, height: 54 }} />
      </div>
      <div className="ld-float" style={{ left: "10%", top: "6%", ["--depth" as string]: 34 }}>
        <Sparkle size={56} className="ld-glow" />
      </div>
      <div className="ld-float" style={{ left: "30%", bottom: "2%", ["--depth" as string]: 30 }}>
        <Sparkle size={30} className="ld-glow" style={{ animationDelay: "-1.4s" }} />
      </div>
      <div className="ld-float" style={{ right: "0%", top: "50%", ["--depth" as string]: 16 }}>
        <span className="ld-pill ld-bob-slow">● Owned outcome</span>
      </div>
      <div className="ld-float" style={{ left: "0%", top: "30%", width: 260, ["--depth" as string]: 14 }}>
        <XpWindow title="question.txt">
          <p className={`min-h-[44px] font-mono text-[12.5px] leading-snug text-ink ${typed.done ? "" : "ld-caret"}`}>{typed.shown}</p>
        </XpWindow>
      </div>
    </div>
  )
}

/* ── 01 · The 5-step loop ───────────────────────────────────────────────── */

const STEPS = [
  { name: "Ask", line: "Write one clear question, and say what you believe today.", detail: "AI sharpens the wording. It never answers the question for you." },
  { name: "People", line: "Shortlist customers by coded ID, never by name.", detail: "Contacts stay hidden. Every reveal is logged against a person." },
  { name: "Talk", line: "Invite, schedule and record consent before any conversation counts.", detail: "No consent on record, no conversation marked done." },
  { name: "Capture", line: "Turn transcripts into notes, and notes into findings with limits.", detail: "Their words and our interpretation are kept apart." },
  { name: "Decide", line: "Close with an outcome, an owner and a review date.", detail: "A request can't close without at least one owned outcome." },
]

export function LoopDiagram() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), 3200)
    return () => window.clearInterval(id)
  }, [paused])

  const step = STEPS[active]
  return (
    <div
      className="grid items-center gap-10 md:grid-cols-[380px_1fr]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="relative mx-auto size-[340px]">
        <svg viewBox="0 0 340 340" className="absolute inset-0" aria-hidden>
          <circle cx="170" cy="170" r="130" fill="none" stroke="var(--line-2)" strokeDasharray="3 8" />
          <circle
            cx="170"
            cy="170"
            r="130"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${((active + 1) / STEPS.length) * 816.8} 816.8`}
            transform="rotate(-90 170 170)"
            style={{ transition: "stroke-dasharray .6s ease" }}
          />
        </svg>
        <div className="ld-orb absolute inset-0 m-auto grid size-[120px] place-items-center">
          <span className="font-serif text-[52px] leading-none text-white italic">
            {active + 1}
          </span>
        </div>
        {STEPS.map((s, i) => {
          const angle = (i / STEPS.length) * Math.PI * 2 - Math.PI / 2
          return (
            <button
              key={s.name}
              type="button"
              className="ld-node"
              aria-pressed={i === active}
              aria-label={`Step ${i + 1}: ${s.name}`}
              style={{ left: 170 + Math.cos(angle) * 130, top: 170 + Math.sin(angle) * 130 }}
              onClick={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              0{i + 1}
            </button>
          )
        })}
      </div>

      <div>
        <ol className="flex flex-col">
          {STEPS.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => setActive(i)}
                className={`flex w-full items-baseline gap-4 border-l-2 py-2.5 pl-4 text-left transition-colors ${
                  i === active ? "border-accent" : "border-line hover:border-line-2"
                }`}
              >
                <span className={`w-20 shrink-0 text-[17px] font-semibold ${i === active ? "text-ink" : "text-ink-2"}`}>{s.name}</span>
                <span className={`text-[15px] ${i === active ? "text-ink" : "text-ink-3"}`}>{s.line}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-5 min-h-[48px] rounded-[10px] border border-line bg-surface px-4 py-3 text-sm text-ink-2" aria-live="polite">
          <span className="rl-mono mr-2 text-accent">Guardrail</span>
          {step.detail}
        </p>
      </div>
    </div>
  )
}

/* ── 02 · What AI does ──────────────────────────────────────────────────── */

const INVITES = [
  "Hi — you bought our shampoo a little while ago. Could we ask you about it for 20 minutes? There are no right answers.",
  "Hello — we're trying to learn how our shampoo fits into people's routines. Would you have 20 minutes to talk this week?",
]

const POINTS = [
  { kind: "words", text: "“Came nine days late, bought another brand.”" },
  { kind: "interpretation", text: "Delivery delay may have caused the switch." },
  { kind: "words", text: "“I forgot about it.”" },
  { kind: "interpretation", text: "No reminder to reorder reached them." },
] as const

const FINDINGS = [
  { text: "Late delivery drove switching in one case", source: "R-003 · P-04", limits: "One conversation; how common is unknown", known: true },
  { text: "Customers find us expensive", source: "Source unknown", limits: "Not traced to any conversation", known: false },
]

export function AiWindows() {
  const [draft, setDraft] = useState(0)
  const [run, setRun] = useState(0)
  const invite = useTyped(INVITES[draft], run)
  const [kind, setKind] = useState<"all" | "words" | "interpretation">("all")
  const [finding, setFinding] = useState(0)
  const f = FINDINGS[finding]

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <XpWindow title="Drafts invites — invite.txt">
        <div className="flex min-h-[190px] flex-col gap-3">
          <DraftChip />
          <p className={`flex-1 text-sm leading-relaxed text-ink ${invite.done ? "" : "ld-caret"}`}>{invite.shown}</p>
          <button
            type="button"
            className="rl-btn rl-btn-sm self-start"
            onClick={() => {
              setDraft((d) => (d + 1) % INVITES.length)
              setRun((r) => r + 1)
            }}
          >
            Draft another
          </button>
        </div>
      </XpWindow>

      <XpWindow title="Summarises transcripts — note">
        <div className="flex min-h-[190px] flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {(["all", "words", "interpretation"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  kind === k ? "border-accent bg-accent-soft text-ink" : "border-line-2 text-ink-2 hover:text-ink"
                }`}
              >
                {k === "all" ? "Everything" : k === "words" ? "Their words" : "Our interpretation"}
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-2">
            {POINTS.map((p) => (
              <li
                key={p.text}
                className="rounded-[9px] border border-line px-3 py-2 text-[13px] text-ink transition-opacity"
                style={{ opacity: kind === "all" || kind === p.kind ? 1 : 0.25 }}
              >
                <span className="rl-mono mr-2">{p.kind === "words" ? "Words" : "Interp."}</span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      </XpWindow>

      <XpWindow title="Suggests findings — with sources">
        <div className="flex min-h-[190px] flex-col gap-3">
          <DraftChip />
          <p className="text-[15px] font-semibold text-ink">{f.text}</p>
          <p className="text-[13px] text-ink-2">
            <span className="rl-mono mr-2">Source</span>
            <span className={f.known ? "text-ink" : "font-semibold text-ink"}>{f.source}</span>
          </p>
          <p className="text-[13px] text-ink-2">
            <span className="rl-mono mr-2">Limits</span>
            {f.limits}
          </p>
          <button type="button" className="rl-btn rl-btn-sm mt-auto self-start" onClick={() => setFinding((v) => (v + 1) % FINDINGS.length)}>
            Next finding
          </button>
        </div>
      </XpWindow>
    </div>
  )
}

/* ── 03 · Where outcomes land ───────────────────────────────────────────── */

const DESTINATIONS = [
  { name: "Slack", live: true, line: "A closed request posts its outcomes, owners and review dates to #research." },
  { name: "Linear", live: false, line: "An experiment becomes a ticket for the owning team." },
  { name: "Notion", live: false, line: "A reviewed report lands in the team wiki." },
  { name: "Gmail", live: false, line: "A reviewed invite goes out from the owner's inbox." },
]

export function Destinations() {
  return (
    <div className="flex flex-col items-center">
      <span className="ld-pill">● Outcome · owner · review date</span>
      <div className="grid w-full gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
        {DESTINATIONS.map((d) => (
          <div key={d.name} className="ld-dest" data-live={d.live}>
            <div className="ld-wire" aria-hidden />
            <article className="ld-tile rl-card flex h-[170px] flex-col gap-2 p-4">
              <div className="flex items-center gap-3">
                <span aria-hidden className="ld-glyph" data-planned={!d.live}>
                  {d.name[0]}
                </span>
                <h3 className="text-[16px] font-semibold text-ink">{d.name}</h3>
                <span className="rl-tag ml-auto" data-tone={d.live ? "accent" : undefined}>
                  {d.live ? "Live" : "Planned"}
                </span>
              </div>
              <p className="text-sm text-ink-2">{d.line}</p>
            </article>
          </div>
        ))}
      </div>
    </div>
  )
}
