import { EmptyState } from "@/components/WorkspaceBits"
import { listFindings, type FindingDTO } from "@/lib/db"
import { errorMessage } from "@/lib/utils"
import { LibrarySearch } from "./LibrarySearch"

export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  let findings: FindingDTO[]
  try {
    findings = await listFindings()
  } catch (err) {
    return <EmptyState title="The Library couldn't be loaded.">{errorMessage(err)}</EmptyState>
  }
  return <LibrarySearch findings={findings} />
}
