import Link from "next/link"
import { notFound } from "next/navigation"
import { RequestStepper, StatusTag, WorkspaceTabs } from "@/components/RequestStepper"
import { ChatBar, EmptyState } from "@/components/WorkspaceBits"
import { getRequest, type RequestDTO } from "@/lib/db"
import { errorMessage, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

// Workspace shell: header, stepper, Data/Docs tabs and the bottom chat bar.
export default async function RequestLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let request: RequestDTO | null
  try {
    request = await getRequest(id)
  } catch (err) {
    return <EmptyState title="This request couldn't be loaded.">{errorMessage(err)}</EmptyState>
  }
  if (!request) notFound()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/requests" className="rl-mono hover:text-ink">
            Requests
          </Link>
          <span className="rl-mono">/</span>
          <span className="rl-mono text-ink">{request.id}</span>
          <StatusTag status={request.status} />
          {request.area && <span className="rl-tag">{request.area}</span>}
        </div>
        <h1 className="max-w-[30ch] text-[32px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
          {request.question}
        </h1>
        <p className="rl-hint">
          Owner: {request.owner_name ?? "none"} · Opened {formatDate(request.created_at)}
          {request.closed_at ? ` · Closed ${formatDate(request.closed_at)}` : ""}
        </p>
      </header>

      <RequestStepper requestId={request.id} currentStep={request.current_step} status={request.status} />
      <WorkspaceTabs requestId={request.id} currentStep={request.current_step} />

      <div>{children}</div>
      <ChatBar requestId={request.id} />
    </div>
  )
}
