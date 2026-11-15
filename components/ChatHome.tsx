"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { AddContextPanel } from "@/components/AddContextPanel"
import { ChatInput, ChatThread } from "@/components/ChatInput"
import { useApp } from "@/components/Providers"
import { StatusTag } from "@/components/RequestStepper"
import { RolePicker } from "@/components/RolePicker"
import type { RequestListItem } from "@/lib/db"
import { STEP_LABEL, type Role } from "@/lib/utils"

// Role-specific quick prompts (brief §3). Each one is answerable from seeded data.
const QUICK_PROMPTS: Record<Role, string[]> = {
  growth: [
    "What's new in R-003?",
    "What do we know about late delivery?",
    "Draft a follow-up question for R-003",
    "Has anyone raised price as a reason not to reorder?",
  ],
  brand: [
    "What did we decide after R-001?",
    "What do we know about how customers describe our products?",
    "Which outcomes of mine are due for review?",
  ],
  product: [
    "What came out of the moisturiser request?",
    "What do we know about products feeling heavy?",
    "Draft a follow-up question for R-002",
  ],
  cx: [
    "Which findings echo support tickets?",
    "What do we know about late deliveries?",
    "Which findings have an unknown source?",
  ],
  ceo: [
    "Which requests closed with an owned outcome?",
    "What is R-003 trying to find out?",
    "Which outcomes are due for review next?",
  ],
  ops: ["Which requests are open right now?", "What's the state of R-003?"],
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

const subscribeNever = () => () => {}

export function ChatHome({ recent, loadError }: { recent: RequestListItem[]; loadError: string | null }) {
  const { member, chat, openVoice, openNewRequest, selectedContext, setSelectedContext } = useApp()

  // Local time is only known in the browser; the server render uses the evening greeting.
  const greeting = useSyncExternalStore(
    subscribeNever,
    () => greetingFor(new Date().getHours()),
    () => "Good evening"
  )

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <h1 className="rl-greeting">
          {greeting}, <span className="rl-serif text-[1.08em]">{member.name}</span>
        </h1>
        <p className="mt-4 max-w-[56ch] text-base text-ink-2">
          Ask what customers have told us, pick up a request, or start a new one. AI drafts the boring parts — you keep
          the judgment.
        </p>

        <div className="mt-6">
          <RolePicker />
        </div>

        <section className="mt-8" aria-label="Chat">
          <ChatThread messages={chat.messages} busy={chat.busy} className="mb-4" />
          <ChatInput
            size="lg"
            busy={chat.busy}
            onSend={chat.send}
            onVoice={openVoice}
            placeholder="Ask about customers, findings, or a request…"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS[member.role].map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rl-pill"
                disabled={chat.busy}
                onClick={() => void chat.send(prompt)}
              >
                {prompt}
              </button>
            ))}
            {chat.messages.length > 0 && (
              <button type="button" className="rl-pill" disabled={chat.busy} onClick={chat.reset}>
                Clear chat
              </button>
            )}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="recent-heading">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="recent-heading" className="rl-h2">
              Recent requests
            </h2>
            <Link href="/requests" className="rl-link text-sm">
              View all
            </Link>
            <button
              type="button"
              className="rl-btn rl-btn-primary ml-auto"
              onClick={openNewRequest}
              disabled={!member.canOwn}
            >
              + New research request
            </button>
          </div>
          {!member.canOwn && (
            <p className="rl-hint mt-2">
              {member.role === "ceo"
                ? `${member.name} has a read-only view, so starting a request is switched off.`
                : `${member.name} reads findings but can't own a request, so starting one is switched off.`}
            </p>
          )}

          {loadError ? (
            <div className="rl-card mt-4 p-5">
              <p className="font-medium text-ink">Requests couldn&apos;t be loaded.</p>
              <p className="rl-hint mt-1">{loadError}</p>
            </div>
          ) : recent.length === 0 ? (
            <div className="rl-card mt-4 p-5">
              <p className="font-medium text-ink">No research requests yet.</p>
              <p className="rl-hint mt-1">Start one and it will show up here.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {recent.map((r) => (
                <Link
                  key={r.id}
                  href={`/requests/${r.id}`}
                  className="rl-card flex flex-col p-5 transition-colors hover:border-line-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="rl-mono text-ink-2">{r.id}</span>
                    <StatusTag status={r.status} />
                  </div>
                  <p className="rl-card-title mt-3">{r.question}</p>
                  <p className="rl-hint mt-auto pt-4">
                    {r.owner_name ?? "No owner"}
                    {r.area ? ` · ${r.area}` : ""}
                    {r.status === "open" ? ` · at ${STEP_LABEL[r.current_step]}` : ""}
                  </p>
                  <p className="rl-mono mt-2">
                    {r.findings_count} findings · {r.outcomes_count} outcomes
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rl-card p-5">
          <AddContextPanel value={selectedContext} onChange={setSelectedContext} />
        </div>
        <p className="rl-hint mt-3 px-1">
          Selected areas travel with your chat and pre-fill new research requests.
        </p>
      </aside>
    </div>
  )
}
