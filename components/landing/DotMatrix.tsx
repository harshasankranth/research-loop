"use client"

import { useEffect, useRef } from "react"

const GAP = 24
const RADIUS = 190
const PUSH = 16
const IDLE_ALPHA = 0.04

// Background ASCII matrix: a grid of digits that is barely there until the
// cursor comes near, then lights up inside a radial spotlight and eases away
// from the pointer. One fixed canvas; pointer events pass through.
export function DotMatrix() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let w = 0
    let h = 0
    let cols = 0
    let rows = 0
    let ox = new Float32Array(0)
    let oy = new Float32Array(0)
    let glow = new Float32Array(0)
    let digit = new Uint8Array(0)
    const mouse = { x: -9999, y: -9999 }
    let ink = "#888"
    let accent = "#3D5BE0"
    let frame = 0
    let raf = 0

    const readColours = () => {
      const s = getComputedStyle(document.documentElement)
      ink = s.getPropertyValue("--ink-3").trim() || ink
      accent = s.getPropertyValue("--accent-2").trim() || accent
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / GAP) + 1
      rows = Math.ceil(h / GAP) + 1
      const n = cols * rows
      ox = new Float32Array(n)
      oy = new Float32Array(n)
      glow = new Float32Array(n)
      digit = new Uint8Array(n)
      for (let i = 0; i < n; i++) digit[i] = Math.floor(Math.random() * 10)
    }

    const draw = () => {
      if (frame++ % 30 === 0) readColours()
      ctx.clearRect(0, 0, w, h)
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const bx = c * GAP
          const by = r * GAP
          const dx = bx - mouse.x
          const dy = by - mouse.y
          const d = Math.hypot(dx, dy)
          let tx = 0
          let ty = 0
          let tg = 0
          if (d < RADIUS) {
            const f = 1 - d / RADIUS
            tg = f
            if (!still && d > 0.01) {
              tx = (dx / d) * f * f * PUSH
              ty = (dy / d) * f * f * PUSH
            }
            // Digits flicker while the spotlight is on them.
            if (!still && Math.random() < 0.02) digit[i] = Math.floor(Math.random() * 10)
          }
          ox[i] += (tx - ox[i]) * 0.14
          oy[i] += (ty - oy[i]) * 0.14
          glow[i] += (tg - glow[i]) * 0.12
          const g = glow[i]
          ctx.globalAlpha = IDLE_ALPHA + g * 0.5
          ctx.fillStyle = g > 0.04 ? accent : ink
          ctx.font = `${g > 0.5 ? 700 : 500} ${8 + g * 2.5}px "JetBrains Mono", monospace`
          ctx.fillText(String(digit[i]), bx + ox[i], by + oy[i])
        }
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    const move = (e: PointerEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const leave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }

    resize()
    readColours()
    raf = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    window.addEventListener("pointermove", move, { passive: true })
    document.documentElement.addEventListener("pointerleave", leave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", move)
      document.documentElement.removeEventListener("pointerleave", leave)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
}
