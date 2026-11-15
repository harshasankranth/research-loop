import { ChatHome } from "@/components/ChatHome"
import { listRequests, type RequestListItem } from "@/lib/db"
import { errorMessage } from "@/lib/utils"

export const dynamic = "force-dynamic"

// Chat-first home. The three most recent requests are loaded on the server;
// everything interactive lives in <ChatHome />.
export default async function HomePage() {
  let recent: RequestListItem[] = []
  let loadError: string | null = null
  try {
    recent = (await listRequests()).slice(0, 3)
  } catch (err) {
    loadError = errorMessage(err)
  }
  return <ChatHome recent={recent} loadError={loadError} />
}
