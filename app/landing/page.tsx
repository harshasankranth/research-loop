import "./landing.css"
import { GoToAppLink } from "@/components/GoToAppLink"
import { DotMatrix } from "@/components/landing/DotMatrix"
import { AiWindows, Destinations, HeroScene, LoopDiagram } from "@/components/landing/LandingParts"
import { ThemeToggle } from "@/components/ThemeToggle"

function Section({ tag, title, accent, lead, children }: { tag: string; title: string; accent: string; lead: string; children: React.ReactNode }) {
  return (
    <section className="py-16">
      <p className="rl-mono text-accent-2">{tag}</p>
      <h2 className="mt-2 text-[34px] leading-tight font-bold tracking-[-0.02em] text-ink">
        {title} <span className="rl-serif text-[1.12em]">{accent}</span>
      </h2>
      <p className="mt-2 mb-10 max-w-[60ch] text-[15px] text-ink-2">{lead}</p>
      {children}
    </section>
  )
}

// Marketing landing. No images: every object is a gradient, an SVG or a canvas.
export default function LandingPage() {
  return (
    <div className="relative flex flex-col">
      <DotMatrix />

      <header className="flex items-center justify-between">
        <span className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Research Loop</span>
        <ThemeToggle />
      </header>

      <section className="grid items-center gap-8 py-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="rl-mono text-accent-2">r/ · for teams that talk to customers</p>
          <h1 className="mt-5 text-[52px] leading-[1.03] font-bold tracking-[-0.03em] text-ink sm:text-[68px]">
            Feed one <span className="rl-serif text-[1.1em]">question</span> to the loop.
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg text-ink-2">
            Research Loop walks every customer question from ask to owned outcome — AI drafts the boring parts, humans
            keep the judgment.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <GoToAppLink />
            <span className="rl-mono">Move your cursor · the numbers react</span>
          </div>
        </div>
        <HeroScene />
      </section>

      <Section tag="01" title="The 5-step" accent="loop" lead="One question goes all the way round. Pick a step to see what happens there.">
        <LoopDiagram />
      </Section>

      <Section tag="02" title="What AI" accent="does" lead="Three drafting jobs. Each one is marked as a draft until a person approves it.">
        <AiWindows />
      </Section>

      <Section
        tag="03"
        title="Where outcomes"
        accent="land"
        lead="Outcomes go to where teams already work. Slack is live; Linear, Notion and Gmail are designed to connect the same way, via MCP."
      >
        <Destinations />
      </Section>

      <section className="flex flex-col items-center gap-5 py-14 text-center">
        <h2 className="text-[30px] font-bold tracking-[-0.02em] text-ink">
          Start with one <span className="rl-serif text-[1.12em]">question</span>.
        </h2>
        <GoToAppLink />
      </section>

      <footer className="border-t border-line py-8">
        <p className="rl-mono">Built for Aiwah Labs FDE take-home · Harsha Sankranth · Nov 2026</p>
      </footer>
    </div>
  )
}
