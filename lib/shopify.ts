// Shopify pull connector (brief §14). Returns anonymised rows only.
import { createAdminApiClient } from "@shopify/admin-api-client"

export interface CustomerCandidate {
  id: string
  channel: string
  segment: string
  product: string
  first_order_days_ago: number
}

export class ShopifyError extends Error {
  code: "not_configured" | "request_failed"
  constructor(code: "not_configured" | "request_failed", message: string) {
    super(message)
    this.name = "ShopifyError"
    this.code = code
  }
}

interface CustomersQuery {
  customers: {
    edges: {
      node: {
        id: string
        // UnsignedInt64 scalars arrive as strings.
        numberOfOrders: string | number
        createdAt: string
      }
    }[]
  }
}

export function shopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_STORE && process.env.SHOPIFY_ADMIN_TOKEN)
}

/**
 * SIMULATED. Hard-coded sample customers, used until real Shopify credentials
 * are added. They are the same eight customers the seed shortlists on R-003
 * (drizzle/seed.ts), so the demo is consistent end to end.
 */
export const SIMULATED_CUSTOMERS: CustomerCandidate[] = [
  { id: "C-1042", channel: "Website", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 41 },
  { id: "C-1057", channel: "Website", segment: "Gift", product: "Shampoo 250ml", first_order_days_ago: 52 },
  { id: "C-1063", channel: "Website", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 63 },
  { id: "C-1071", channel: "Marketplace", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 58 },
  { id: "C-1088", channel: "Website", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 74 },
  { id: "C-1094", channel: "Marketplace", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 66 },
  { id: "C-1102", channel: "Website", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 49 },
  { id: "C-1115", channel: "Website", segment: "First-time", product: "Shampoo 250ml", first_order_days_ago: 80 },
]

export interface SegmentPull {
  customers: CustomerCandidate[]
  /** True when the rows are the hard-coded sample, not a real Shopify response. */
  simulated: boolean
}

/** Real Shopify when credentials exist; otherwise the simulated sample (the filter is ignored). */
export async function pullCustomerSegment(filter: string): Promise<SegmentPull> {
  if (!shopifyConfigured()) return { customers: SIMULATED_CUSTOMERS, simulated: true }
  return { customers: await pullFromShopify(filter), simulated: false }
}

async function pullFromShopify(filter: string): Promise<CustomerCandidate[]> {
  const client = createAdminApiClient({
    storeDomain: process.env.SHOPIFY_STORE!,
    apiVersion: "2025-01",
    accessToken: process.env.SHOPIFY_ADMIN_TOKEN!,
  })
  const resp = await client.request<CustomersQuery>(
    `
    query ($q: String!) {
      customers(first: 60, query: $q) {
        edges { node {
          id numberOfOrders createdAt
          defaultAddress { province }
          metafields(first:5) { edges { node { key value }}}
        }}
      }
    }`,
    { variables: { q: filter } }
  )
  if (resp.errors || !resp.data) {
    throw new ShopifyError(
      "request_failed",
      `Shopify didn't return customers (${resp.errors?.message ?? "empty response"}).`
    )
  }
  // Return anonymized: ID, segment attrs, order count. Never email/phone.
  return resp.data.customers.edges.map((e, i) => ({
    id: `C-${1001 + i}`,
    channel: "Website",
    segment: Number(e.node.numberOfOrders) === 1 ? "First-time" : "Repeat",
    product: "Shampoo 250ml",
    first_order_days_ago: Math.round((Date.now() - new Date(e.node.createdAt).getTime()) / 86400000),
  }))
}
