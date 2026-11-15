import type { Metadata } from "next"
import "./globals.css"
import { AppNav } from "@/components/AppNav"
import { Providers } from "@/components/Providers"
import { listContextAreas, type ContextGroup } from "@/lib/db"

export const metadata: Metadata = {
  title: "Research Loop — Everyday Goods",
  description:
    "One shared loop for customer questions: Question → People → Talk → Capture → Decide. AI drafts, humans decide.",
}

export const dynamic = "force-dynamic"

// Runs before first paint so the stored theme never flashes. Key: rl-theme, default light.
const themeScript = `(function(){var t='light';try{if(localStorage.getItem('rl-theme')==='dark')t='dark'}catch(e){}document.documentElement.setAttribute('data-theme',t)})()`

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let contextGroups: ContextGroup[] = []
  try {
    contextGroups = await listContextAreas()
  } catch {
    // Pages render their own "database isn't connected" state; the shell still loads.
  }

  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="ld-leaks" aria-hidden>
          <span className="ld-leak" />
          <span className="ld-leak" />
          <span className="ld-leak" />
        </div>
        <Providers contextGroups={contextGroups}>
          <AppNav />
          <main className="mx-auto w-full max-w-[1200px] px-6 pt-10 pb-32">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
