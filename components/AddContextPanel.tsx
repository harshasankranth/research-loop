"use client"

import { useApp } from "@/components/Providers"
import { cn } from "@/lib/utils"

/**
 * Focus-area pills. ONE component, two placements: the home sidebar and the
 * new-request modal (brief rule 15). It is controlled, so each placement decides
 * where the selection is kept.
 */
export function AddContextPanel({
  value,
  onChange,
  title = "Add context",
  className,
}: {
  value: string[]
  onChange: (next: string[]) => void
  title?: string
  className?: string
}) {
  const { contextGroups } = useApp()

  const toggle = (area: string) =>
    onChange(value.includes(area) ? value.filter((v) => v !== area) : [...value, area])

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div>
        <h2 className="rl-h2">{title}</h2>
        <p className="rl-hint mt-1">Focus areas steer every AI draft. All off by default.</p>
      </div>

      {contextGroups.length === 0 ? (
        <p className="rl-hint">No context areas are set up in this workspace yet.</p>
      ) : (
        contextGroups.map((group) => (
          <fieldset key={group.group} className="min-w-0">
            <legend className="rl-mono mb-2">{group.group}</legend>
            <div className="flex flex-wrap gap-2">
              {group.values.map((area) => {
                const selected = value.includes(area)
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={selected}
                    data-selected={selected}
                    className="rl-pill"
                    onClick={() => toggle(area)}
                  >
                    {area}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))
      )}

      {value.length > 0 && (
        <button type="button" className="rl-link self-start text-[13px]" onClick={() => onChange([])}>
          Clear {value.length} selected
        </button>
      )}
    </div>
  )
}
