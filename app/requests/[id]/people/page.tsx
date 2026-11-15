import { notFound } from "next/navigation"
import { getRequest, listPeople } from "@/lib/db"
import { PeopleStep } from "./PeopleStep"

export const dynamic = "force-dynamic"

export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()
  const people = await listPeople(request.id)
  return <PeopleStep request={request} people={people} />
}
