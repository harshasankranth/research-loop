import { notFound } from "next/navigation"
import { getRequest, listPeople } from "@/lib/db"
import { TalkStep } from "./TalkStep"

export const dynamic = "force-dynamic"

export default async function TalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()
  const people = await listPeople(request.id)
  return <TalkStep request={request} people={people} />
}
