"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Command as Cmdk } from "cmdk"
import { ChatInput, ChatThread } from "@/components/ChatInput"
import { useApp, type PaletteMode } from "@/components/Providers"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

const PAGES = [
  { label: "Home", href: "/app" },
  { label: "Requests", href: "/requests" },
  { label: "R-003 · Capture", href: "/requests/R-003/capture" },
  { label: "Library", href: "/library" },
  { label: "Sources", href: "/sources" },
  { label: "Summary", href: "/summary" },
]

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-2 text-sm text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink"

/** ⌘K command palette; ⌘J opens it straight in chat mode. */
export function CommandPalette({
  open,
  onOpenChange,
  mode,
  onModeChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PaletteMode
  onModeChange: (mode: PaletteMode) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { chat, member, openVoice, openNewRequest } = useApp()
  const [query, setQuery] = useState("")
  const requestId = pathname.match(/^\/requests\/(R-\d+)/)?.[1]

  const go = (href: string) => {
    onOpenChange(false)
    setQuery("")
    router.push(href)
  }

  const ask = (text: string) => {
    onModeChange("chat")
    setQuery("")
    void chat.send(text)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-h-[70dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Jump to a page, run an action, or ask the assistant.</DialogDescription>

        {mode === "commands" ? (
          <Cmdk label="Command palette" className="flex flex-col">
            <Cmdk.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Search, jump, or ask a question…"
              className="h-12 w-full border-b border-line bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
            />
            <Cmdk.List className="max-h-[50dvh] overflow-y-auto p-2">
              {query.trim() && (
                <Cmdk.Group>
                  <Cmdk.Item value={`ask ${query}`} forceMount className={itemClass} onSelect={() => ask(query.trim())}>
                    <span className="rl-mono text-accent-2">Ask AI</span>
                    <span className="truncate">{query.trim()}</span>
                  </Cmdk.Item>
                </Cmdk.Group>
              )}
              <Cmdk.Group heading={<span className="rl-mono block px-3 pt-2 pb-1">Actions</span>}>
                <Cmdk.Item value="chat with data ask assistant" className={itemClass} onSelect={() => onModeChange("chat")}>
                  {requestId ? `Chat with data in ${requestId}` : "Chat with the assistant"}
                  <kbd className="rl-mono ml-auto">⌘J</kbd>
                </Cmdk.Item>
                <Cmdk.Item value="call with ai voice" className={itemClass} onSelect={openVoice}>
                  <span aria-hidden>🎙</span> Call with AI
                </Cmdk.Item>
                {member.canOwn && (
                  <Cmdk.Item value="new research request create" className={itemClass} onSelect={openNewRequest}>
                    + New research request
                  </Cmdk.Item>
                )}
              </Cmdk.Group>
              <Cmdk.Group heading={<span className="rl-mono block px-3 pt-3 pb-1">Go to</span>}>
                {PAGES.map((p) => (
                  <Cmdk.Item key={p.href} value={`go ${p.label}`} className={itemClass} onSelect={() => go(p.href)}>
                    {p.label}
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            </Cmdk.List>
          </Cmdk>
        ) : (
          <div className="flex max-h-[70dvh] flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <span className="rl-mono text-ink">
                {requestId ? `Chat with data in ${requestId}` : "Chat with the assistant"}
              </span>
              <button type="button" className="rl-link ml-auto text-[13px]" onClick={() => onModeChange("commands")}>
                Commands
              </button>
              {chat.messages.length > 0 && (
                <button type="button" className="rl-link text-[13px]" onClick={chat.reset}>
                  Clear
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {chat.messages.length === 0 && !chat.busy ? (
                <p className="rl-hint py-4">
                  Ask about a request or the Library. Answers come from saved findings — if there isn&apos;t enough,
                  the assistant says so.
                </p>
              ) : (
                <ChatThread messages={chat.messages} busy={chat.busy} />
              )}
            </div>
            <ChatInput
              onSend={chat.send}
              busy={chat.busy}
              autoFocus
              placeholder={requestId ? `Ask about ${requestId}…` : "Ask a question…"}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
