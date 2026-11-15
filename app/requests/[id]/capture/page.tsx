import { notFound } from "next/navigation"
import { getRequest, listFindings, listNotes, listPeople } from "@/lib/db"
import { CaptureStep } from "./CaptureStep"

export const dynamic = "force-dynamic"

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()
  const [people, notes, findings] = await Promise.all([
    listPeople(request.id),
    listNotes(request.id),
    listFindings({ requestId: request.id }),
  ])
  return <CaptureStep request={request} people={people} notes={notes} findings={findings} />
}
