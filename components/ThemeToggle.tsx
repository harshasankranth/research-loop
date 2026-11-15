"use client"

import { useStored } from "@/components/Providers"
import { THEME_KEY } from "@/lib/utils"

// Light by default; the choice is kept in localStorage under rl-theme.
export function ThemeToggle() {
  const [stored, setStored] = useStored("local", THEME_KEY)
  const theme = stored === "dark" ? "dark" : "light"

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", next)
    setStored(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-2 px-3 font-mono text-xs text-ink-2 transition-colors hover:text-ink"
    >
      {theme === "dark" ? "◐ Dark" : "☀ Light"}
    </button>
  )
}
