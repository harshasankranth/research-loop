import { notFound } from "next/navigation"
import { getRequest } from "@/lib/db"
import { QuestionStep } from "./QuestionStep"

export const dynamic = "force-dynamic"

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()
  return <QuestionStep request={request} />
}
