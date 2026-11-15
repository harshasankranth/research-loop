"use client"

// App-wide client state: acting persona, selected context areas, the shared
// text chat, and the three overlays that can open from any page (command
// palette, voice call, new research request).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CommandPalette } from "@/components/CommandPalette"
import { NewRequestModal } from "@/components/NewRequestModal"
import { VoiceCallModal } from "@/components/VoiceCallModal"
import { Toaster } from "@/components/ui/toast"
import { setToolRouter } from "@/components/voice/tools"
import { useTextChat, type TextChat } from "@/components/voice/useTextChat"
import type { ContextGroup } from "@/lib/db"
import { CONTEXT_KEY, DEFAULT_MEMBER, memberByName, ROLE_KEY, type TeamMember } from "@/lib/utils"

/* ── Storage-backed values without hydration mismatches ─────────────────── */

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function storageOf(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

/** Read/write one storage key. Renders null on the server and until hydrated. */
export function useStored(kind: "local" | "session", key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => storageOf(kind)?.getItem(key) ?? null,
    () => null
  )
  const set = useCallback(
    (next: string) => {
      try {
        storageOf(kind)?.setItem(key, next)
      } catch {
        // Storage can be blocked (private mode): the value just won't persist.
      }
      listeners.forEach((notify) => notify())
    },
    [kind, key]
  )
  return [value, set]
}

/* ── Context ────────────────────────────────────────────────────────────── */

export type PaletteMode = "commands" | "chat"

interface AppContextValue {
  member: TeamMember
  setMember: (name: string) => void
  contextGroups: ContextGroup[]
  selectedContext: string[]
  setSelectedContext: (next: string[]) => void
  chat: TextChat
  openPalette: (mode?: PaletteMode) => void
  openVoice: () => void
  openNewRequest: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used inside <Providers>")
  return ctx
}

function parseContext(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

export function Providers({
  contextGroups,
  children,
}: {
  contextGroups: ContextGroup[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  // Role picker: sessionStorage key rl-role, default Anita.
  const [storedRole, setStoredRole] = useStored("session", ROLE_KEY)
  const member = memberByName(storedRole) ?? DEFAULT_MEMBER

  const [storedContext, setStoredContext] = useStored("local", CONTEXT_KEY)
  const selectedContext = useMemo(() => parseContext(storedContext), [storedContext])
  const setSelectedContext = useCallback(
    (next: string[]) => setStoredContext(JSON.stringify(next)),
    [setStoredContext]
  )

  const chat = useTextChat(() => ({ path: pathname, context_areas: selectedContext }))

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands")
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [newRequestOpen, setNewRequestOpen] = useState(false)

  const openPalette = useCallback((mode: PaletteMode = "commands") => {
    setPaletteMode(mode)
    setPaletteOpen(true)
  }, [])
  const openVoice = useCallback(() => {
    setPaletteOpen(false)
    setVoiceOpen(true)
  }, [])
  const openNewRequest = useCallback(() => {
    setPaletteOpen(false)
    setNewRequestOpen(true)
  }, [])

  // The assistant's navigate_to_step tool needs the app router.
  useEffect(() => {
    setToolRouter(router)
    return () => setToolRouter(null)
  }, [router])

  // ⌘K / Ctrl+K: command palette. ⌘J / Ctrl+J: straight to chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === "k") {
        e.preventDefault()
        openPalette("commands")
      } else if (key === "j") {
        e.preventDefault()
        openPalette("chat")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openPalette])

  const value = useMemo<AppContextValue>(
    () => ({
      member,
      setMember: setStoredRole,
      contextGroups,
      selectedContext,
      setSelectedContext,
      chat,
      openPalette,
      openVoice,
      openNewRequest,
    }),
    [member, setStoredRole, contextGroups, selectedContext, setSelectedContext, chat, openPalette, openVoice, openNewRequest]
  )

  return (
    <AppContext.Provider value={value}>
      <Toaster>
        {children}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} mode={paletteMode} onModeChange={setPaletteMode} />
        <NewRequestModal open={newRequestOpen} onOpenChange={setNewRequestOpen} />
        <VoiceCallModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      </Toaster>
    </AppContext.Provider>
  )
}
