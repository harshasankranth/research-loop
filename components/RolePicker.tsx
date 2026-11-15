"use client"

import { useApp } from "@/components/Providers"
import { TEAM } from "@/lib/utils"

// Demo identity switch. The choice lives in sessionStorage under rl-role
// (default Anita) and is sent with every API call as the acting person.
export function RolePicker() {
  const { member, setMember } = useApp()

  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="View as">
      <span className="rl-mono mr-1">View as</span>
      {TEAM.filter((m) => m.inPicker).map((m) => {
        const selected = m.name === member.name
        return (
          <button
            key={m.name}
            type="button"
            role="radio"
            aria-checked={selected}
            data-selected={selected}
            className="rl-pill"
            onClick={() => setMember(m.name)}
          >
            {m.name}
            <span className="rl-mono text-[10px]">{m.title}</span>
          </button>
        )
      })}
    </div>
  )
}
