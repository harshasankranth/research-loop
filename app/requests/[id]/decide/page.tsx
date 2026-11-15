import { notFound } from "next/navigation"
import { getRequest, listFindings, listOutcomes } from "@/lib/db"
import { DecideStep } from "./DecideStep"

export const dynamic = "force-dynamic"

export default async function DecidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()
  const [outcomes, findings] = await Promise.all([listOutcomes(request.id), listFindings({ requestId: request.id })])
  return <DecideStep request={request} outcomes={outcomes} findingsCount={findings.length} />
}
