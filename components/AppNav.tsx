"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useApp } from "@/components/Providers"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/app", label: "Home" },
  { href: "/requests", label: "Requests" },
  { href: "/library", label: "Library" },
  { href: "/sources", label: "Sources" },
  { href: "/ops", label: "Ops" },
  { href: "/summary", label: "Summary" },
]

export function AppNav() {
  const pathname = usePathname()
  const { openPalette, openVoice } = useApp()
  // The marketing landing has its own header.
  if (pathname === "/" || pathname === "/landing") return null

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
          <span aria-hidden className="grid size-6 place-items-center rounded-[9px] bg-accent text-accent-ink">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M13 8a5 5 0 1 1-1.6-3.7" />
              <path d="M13 2.5v2.4h-2.4" strokeLinejoin="round" />
            </svg>
          </span>
          Research Loop
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((link) => {
            const active = link.href === "/app" ? pathname === "/app" : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-[9px] px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openPalette("commands")}
            className="hidden h-8 items-center gap-2 rounded-[9px] border border-line-2 px-3 text-[13px] text-ink-2 transition-colors hover:text-ink md:inline-flex"
          >
            Search or ask
            <kbd className="rl-mono">⌘K</kbd>
          </button>
          <button type="button" onClick={openVoice} className="rl-btn rl-btn-sm">
            <span aria-hidden>🎙</span> Call with AI
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
