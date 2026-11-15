# Research Loop

A prototype that walks every customer research question at Everyday Goods (a fictional CPG brand) from **ask → owned outcome**. AI drafts the boring parts; humans keep the judgment.

Built for the Aiwah Labs FDE take-home, Round 2.

**Live:** https://research-loop-woad.vercel.app
**Landing:** https://research-loop-woad.vercel.app/landing
**App:** https://research-loop-woad.vercel.app/app

---

## The loop

Every request moves through five steps:

1. **Ask** — one clear question, with what we believe today.
2. **People** — shortlist customers by coded ID. Contacts stay hidden; every reveal is logged.
3. **Talk** — invite, schedule and record consent before any conversation counts.
4. **Capture** — transcripts become notes (their words vs. our interpretation), notes become findings (with their limits).
5. **Decide** — close with an outcome, an owner and a review date. Slack gets notified.

## What AI does (and doesn't)

AI drafts invites, sharpens the question, splits transcripts into words vs. interpretation, and suggests findings grounded in the notes that support them. Everything is marked **AI draft** until a person approves it. A finding with an unknown source is shown as **source unknown** — never guessed.

**Voice:** Gemini Live, five tools (`lookup_request`, `search_findings_rag`, `navigate_to_step`, `post_outcome_to_slack`, `suggest_followup_question`). Text chat falls back if the mic is denied.

**RAG:** `gemini-embedding-001` at 768 dims, stored in Supabase Postgres with `pgvector` (ivfflat cosine), queried fresh on every call.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript · Turbopack |
| Styling | Tailwind v4 CSS-first · shadcn/ui (base-nova / `@base-ui/react`) · Framer Motion |
| Data | Supabase Postgres · `pgvector` 0.8 · Drizzle 0.45 · `postgres-js` |
| AI | `@google/genai` v3 — text `gemini-3.5-flash-lite`, voice `gemini-2.5-flash-native-audio-preview-09-2025`, embeddings `gemini-embedding-001` |
| Connectors | Slack (live, bot in `#research`) · Shopify (simulated stub — same 8 customers the seed uses) |
| Editor | Tiptap · cmdk palette |
| Deploy | Vercel (`syd1` region) |

## Pages

- **`/`, `/landing`** — marketing landing. Y2K-style stars, liquid-glass panels, an ASCII number matrix that lights up around the cursor, interactive loop diagram, three glass "What AI does" panels, four destinations wired to one outcome pill.
- **`/app`** — chat-first home. Role picker, context panel, recent requests, ⌘K palette, voice call.
- **`/requests`, `/requests/[id]/{question,people,talk,capture,decide,docs}`** — the five-step workspace per request.
- **`/library`** — pgvector semantic search over all findings.
- **`/sources`** — eight connector tiles (two live, six UI-only patterns).
- **`/summary`** — four CEO numbers: median days to first conversation, % of closed requests with an owned outcome, findings reused, usefulness rating. Two numbers deliberately not shown.
- **`/ops`** — Ravi's dashboard. Which requests need a customer list, one-click Shopify pull (simulated) with a filter dropdown, CSV upload, and the access log of who revealed which contact.

## Guardrails

- **AI draft chip** on every AI output, until approved.
- **Every AI call** is written to `audit_log` with model, latency, actor and target.
- **Source unknown** is shown as unknown, never guessed.
- **Consent** must be on record before a conversation can be marked done.
- **Close** needs at least one owned outcome with an owner and a review date.
- **CEO role** is read-only. Only the owner or Ops can close a request.
- **Contact reveal** is logged against the actor before the number is returned.
- **`tsc --noEmit`** passes.

## Deviations from the brief

A short list of things that differ from the brief as written:

- **Text model** pinned to `gemini-3.5-flash-lite` — the brief's `gemini-2.5-flash-preview-09-2025` was shut down and `gemini-2.5-flash` is closed to this key.
- **Shopify** is a simulated stub returning eight hard-coded customers (same as the seed), with every pull audit-logged `simulated: true`. Real Shopify code is still there; adding `SHOPIFY_STORE` and `SHOPIFY_ADMIN_TOKEN` switches it over.
- **Landing redesign** (not in the brief): hero scene, interactive loop, liquid-glass panels, ASCII number matrix, light-mode default. The app itself still follows the brief's locked design tokens.
- **Row-level security** disabled on all tables for the prototype (`drizzle/0001_disable_rls.sql`). Turn it back on before real data.
- **Slack link** follows `VERCEL_PROJECT_PRODUCTION_URL`, so it is right locally and in production, instead of being hard-coded.
- **Seed placeholders:** R-001 and R-002's `rating` and `first_days` are placeholder values so the summary has numbers to show; marked in `drizzle/seed.ts`.
- **Ops role** added at `/ops`.

## Run it locally

```bash
cp .env.local.example .env.local   # then fill in the keys
npm install
npm run drizzle:push               # only if the schema isn't applied
npx tsx drizzle/seed.ts            # loads 6 users, 3 requests, 8 people, 5 notes, 8 findings
npm run dev
```

Open `http://localhost:3000`.

### Environment

See `.env.local.example`. Required: `GEMINI_API_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `SLACK_BOT_TOKEN`, `SHOPIFY_STORE`, `SHOPIFY_ADMIN_TOKEN`.

## Deploy

```bash
vercel link
vercel env add ...                 # one per key above
vercel --prod
```

Vercel's `syd1` is pinned in `vercel.json` to keep pgvector round-trips close to Supabase Sydney.

## Layout

```
app/
  api/            # 14 routes: requests, notes, findings, close, library/search,
                  #   slack/post, shopify/customers, ai/*, voice/token, chat
  app/            # chat-first home
  landing/        # marketing landing
  library/, ops/, sources/, summary/, requests/[id]/*
components/
  landing/        # DotMatrix (ASCII), LandingParts (hero, loop, AI windows, destinations)
  voice/          # tools.ts (5 tools), useGeminiLive, useTextChat
  ui/             # shadcn/base-nova
  ChatHome, RolePicker, AddContextPanel, NewRequestModal, ChatInput,
  ThemeToggle, ShowThinking, RequestStepper, WorkspaceBits, FindingCard, …
lib/
  db.ts, schema.ts, ai.ts, rag.ts, embeddings.ts, audit.ts,
  prompts.ts, slack.ts, shopify.ts, utils.ts
drizzle/
  0000_init.sql, 0001_disable_rls.sql, seed.ts
public/
  voice/pcm-processor.js, sample-customers.csv
```

---

Built by **Harsha Sankranth** · November 2026

Co-authored with Claude Code.
