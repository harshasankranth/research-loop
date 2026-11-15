import { notFound } from "next/navigation"
import { getRequest, listDocs, listNotes } from "@/lib/db"
import { DocsTab } from "./DocsTab"

export const dynamic = "force-dynamic"

// Dovetail-style Docs tab: starter templates plus a Tiptap editor.
export default async function DocsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ draft?: string }>
}) {
  const { id } = await params
  const { draft } = await searchParams
  const request = await getRequest(id)
  if (!request) notFound()
  const [docs, notes] = await Promise.all([listDocs(request.id), listNotes(request.id)])
  return <DocsTab request={request} docs={docs} notes={notes} autoDraftReport={draft === "report"} />
}
