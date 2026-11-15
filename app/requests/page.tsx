import { EmptyState } from "@/components/WorkspaceBits"
import { listRequests, type RequestListItem } from "@/lib/db"
import { errorMessage } from "@/lib/utils"
import { RequestsList } from "./RequestsList"

export const dynamic = "force-dynamic"

export default async function RequestsPage() {
  let requests: RequestListItem[]
  try {
    requests = await listRequests()
  } catch (err) {
    return <EmptyState title="Requests couldn't be loaded.">{errorMessage(err)}</EmptyState>
  }
  return <RequestsList requests={requests} />
}
