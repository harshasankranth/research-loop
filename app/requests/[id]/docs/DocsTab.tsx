"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useApp } from "@/components/Providers"
import { AiDraftChip, ShowThinking } from "@/components/ShowThinking"
import { toast } from "@/components/ui/toast"
import type { AiMeta } from "@/lib/ai"
import type { DocDTO, DocTemplate, NoteDTO, RequestDTO } from "@/lib/db"
import { api, cn, errorMessage, formatDate } from "@/lib/utils"

interface OpenDoc {
  id?: string
  title: string
  template: DocTemplate
  html: string
  /** Unreviewed Gemini text is on screen. */
  aiDraft: boolean
  meta?: AiMeta
  inputs?: string[]
}

interface ReportResponse {
  html: string
  inputs: { findings: number; outcomes: number }
  ai: AiMeta
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Voice of customer: verbatim "words" points only, grouped by person. No AI involved. */
function voiceOfCustomerHtml(request: RequestDTO, notes: NoteDTO[]): string | null {
  const blocks = notes
    .map((n) => ({ person: n.person_id ?? "Unknown", quotes: n.points.filter((p) => p.kind === "words") }))
    .filter((b) => b.quotes.length > 0)
  if (blocks.length === 0) return null
  return [
    `<h1>Voice of customer — ${esc(request.id)}</h1>`,
    `<p>${esc(request.question)}</p>`,
    `<p><em>Verbatim quotes from ${blocks.length} conversations. Nothing here is paraphrased or interpreted.</em></p>`,
    ...blocks.map((b) => `<h2>${esc(b.person)}</h2>${b.quotes.map((q) => `<blockquote><p>${esc(q.content)}</p></blockquote>`).join("")}`),
  ].join("")
}

export function DocsTab({
  request,
  docs,
  notes,
  autoDraftReport,
}: {
  request: RequestDTO
  docs: DocDTO[]
  notes: NoteDTO[]
  autoDraftReport: boolean
}) {
  const router = useRouter()
  const { openPalette, member } = useApp()
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [busy, setBusy] = useState<"report" | "save" | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "rl-prose min-h-[320px] p-5", "aria-label": "Document body" } },
  })

  const open = (next: OpenDoc) => {
    setDoc(next)
    setMessage(null)
    editor?.commands.setContent(next.html)
  }

  const draftReport = async () => {
    setBusy("report")
    setMessage(null)
    try {
      const res = await api<ReportResponse>("/api/ai/write-doc", { body: { request_id: request.id, kind: "summary" } })
      open({
        title: `${request.id} research report`,
        template: "research_report",
        html: res.html,
        aiDraft: true,
        meta: res.ai,
        inputs: [`${res.inputs.findings} findings with their limits`, `${res.inputs.outcomes} outcomes with owners and dates`, "The request's question, reason and belief"],
      })
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  // Arriving from "Close & Post": draft the report straight away, once the editor exists.
  const autoDrafted = useRef(false)
  useEffect(() => {
    if (!autoDraftReport || !editor || autoDrafted.current) return
    autoDrafted.current = true
    void draftReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraftReport, editor])

  const voiceOfCustomer = () => {
    const html = voiceOfCustomerHtml(request, notes)
    if (!html) {
      setMessage("There aren't enough verbatim quotes in this request's notes to build a voice of customer doc.")
      return
    }
    open({ title: `${request.id} voice of customer`, template: "voice_of_customer", html, aiDraft: false })
  }

  const save = async () => {
    if (!doc || !editor) return
    setBusy("save")
    setMessage(null)
    try {
      const res = await api<{ id: string }>(`/api/requests/${request.id}`, {
        method: "PATCH",
        body: {
          op: "save_doc",
          doc_id: doc.id,
          title: doc.title.trim() || "Untitled doc",
          template: doc.template,
          html: editor.getHTML(),
          ai_drafted: doc.aiDraft || doc.template === "research_report",
        },
      })
      setDoc({ ...doc, id: res.id, aiDraft: false })
      toast.add({ title: "Doc saved", description: `Reviewed by ${member.name}.`, type: "success" })
      router.refresh()
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const templates = [
    {
      key: "chat",
      title: "Build using chat",
      body: `Ask questions about ${request.id} and build up an answer.`,
      onClick: () => openPalette("chat"),
    },
    {
      key: "report",
      title: "Research report",
      body:
        request.status === "closed"
          ? "Gemini drafts the summary: question, findings with limits, outcomes, what we're not claiming."
          : "Available once the request is closed.",
      onClick: draftReport,
      disabled: request.status !== "closed" || busy !== null,
    },
    {
      key: "voc",
      title: "Voice of customer",
      body: "Verbatim quotes from the notes, grouped by person. No AI.",
      onClick: voiceOfCustomer,
    },
  ]

  const toolbar: { label: string; active: boolean; run: () => void }[] = editor
    ? [
        { label: "H2", active: editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
        { label: "Bold", active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
        { label: "Italic", active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
        { label: "List", active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
        { label: "Quote", active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
      ]
    : []

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="rl-h2">Start a doc</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={t.disabled}
              onClick={t.onClick}
              className="rl-card flex flex-col gap-2 p-5 text-left transition-colors hover:border-line-2 disabled:opacity-60"
            >
              <span className="rl-card-title">{t.title}</span>
              <span className="rl-hint">{t.key === "report" && busy === "report" ? "Drafting with Gemini…" : t.body}</span>
            </button>
          ))}
        </div>
      </section>

      {message && <p className="rl-card-inset p-3 text-sm text-ink">{message}</p>}

      <section className={cn("rl-card flex flex-col", !doc && "hidden")}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <input
            className="min-w-[200px] flex-1 bg-transparent text-lg font-semibold text-ink outline-none"
            aria-label="Doc title"
            value={doc?.title ?? ""}
            onChange={(e) => doc && setDoc({ ...doc, title: e.target.value })}
          />
          {doc?.aiDraft && <AiDraftChip />}
          <button type="button" className="rl-btn rl-btn-primary rl-btn-sm" disabled={busy !== null || member.role === "ceo"} onClick={save}>
            {busy === "save" ? "Saving…" : doc?.aiDraft ? "Approve & save" : "Save"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
          {toolbar.map((b) => (
            <button key={b.label} type="button" data-selected={b.active} className="rl-pill h-7 px-2.5 text-xs" onClick={b.run}>
              {b.label}
            </button>
          ))}
        </div>
        <EditorContent editor={editor} />
        {doc?.meta && (
          <div className="border-t border-line p-4">
            <ShowThinking meta={doc.meta} inputs={doc.inputs} />
          </div>
        )}
      </section>

      <section>
        <h2 className="rl-h2">Saved docs</h2>
        {docs.length === 0 ? (
          <p className="rl-hint mt-2">No docs saved for {request.id} yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="rl-card flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:border-line-2"
                  onClick={() => open({ id: d.id, title: d.title, template: d.template, html: d.html, aiDraft: false })}
                >
                  <span className="font-medium text-ink">{d.title}</span>
                  {d.ai_drafted && <span className="rl-tag">AI-drafted · reviewed</span>}
                  <span className="rl-hint ml-auto">{formatDate(d.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
