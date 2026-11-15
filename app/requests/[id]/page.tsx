import { notFound, redirect } from "next/navigation"
import { getRequest } from "@/lib/db"

export const dynamic = "force-dynamic"

// /requests/R-003 → the request's current step.
export default async function RequestIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()
  redirect(`/requests/${request.id}/${request.current_step}`)
}
