import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable, TransactionHash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, getReadClient, type WriteClient } from "./genlayer";
import type { Cover, LPPositionView, PerilType, PoolSummary } from "./types";

// ---------------------------------------------------------------------------
// Reads (views) -- no wallet required
// ---------------------------------------------------------------------------

export async function getPoolSummary(): Promise<PoolSummary> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_pool_summary",
    args: [],
  }) as unknown as Promise<PoolSummary>;
}

export async function listPerilTypes(): Promise<PerilType[]> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "list_peril_types",
    args: [],
  }) as unknown as Promise<PerilType[]>;
}

export async function listCovers(offset: number, limit: number): Promise<Cover[]> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "list_covers",
    args: [offset, limit],
  }) as unknown as Promise<Cover[]>;
}

export async function listCoversByBeneficiary(
  beneficiary: string,
  offset: number,
  limit: number
): Promise<Cover[]> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "list_covers_by_beneficiary",
    args: [beneficiary, offset, limit],
  }) as unknown as Promise<Cover[]>;
}

export async function getCover(coverId: string): Promise<Cover> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_cover",
    args: [coverId],
  }) as unknown as Promise<Cover>;
}

export async function getLpPosition(owner: string): Promise<LPPositionView> {
  const client = getReadClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_lp_position",
    args: [owner],
  }) as unknown as Promise<LPPositionView>;
}

// ---------------------------------------------------------------------------
// Writes -- require a client from the connected wallet (injected or generated)
// ---------------------------------------------------------------------------

async function sendWrite(
  client: WriteClient,
  functionName: string,
  args: CalldataEncodable[],
  value?: bigint
) {
  const hash = (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: value ?? 0n,
  })) as TransactionHash;
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 4000,
  });
  return { hash, receipt };
}

export function provideLiquidity(client: WriteClient, valueWei: bigint) {
  return sendWrite(client, "provide_liquidity", [], valueWei);
}

export function requestWithdrawal(client: WriteClient, shares: bigint) {
  return sendWrite(client, "request_withdrawal", [shares]);
}

export function executeWithdrawal(client: WriteClient) {
  return sendWrite(client, "execute_withdrawal", []);
}

export interface OpenCoverArgs {
  perilTypeId: string;
  subject: string;
  keywords: string;
  windowStart: string;
  windowEnd: string;
  coverageAmount: bigint;
  premiumWei: bigint;
  locationLat?: string;
  locationLon?: string;
  thresholdMetric?: string;
  thresholdComparator?: string;
  thresholdValue?: string;
  assetId?: string;
  allowedOutcomes?: string[];
  triggeringOutcomes?: string[];
}

export function openCover(client: WriteClient, a: OpenCoverArgs) {
  return sendWrite(
    client,
    "open_cover",
    [
      a.perilTypeId,
      a.subject,
      a.keywords,
      a.windowStart,
      a.windowEnd,
      a.coverageAmount,
      a.locationLat ?? "",
      a.locationLon ?? "",
      a.thresholdMetric ?? "",
      a.thresholdComparator ?? "",
      a.thresholdValue ?? "",
      a.assetId ?? "",
      a.allowedOutcomes ?? [],
      a.triggeringOutcomes ?? [],
    ],
    a.premiumWei
  );
}

export function checkClaim(client: WriteClient, coverId: string) {
  return sendWrite(client, "check_claim", [coverId]);
}

export function expireUnclaimedCover(client: WriteClient, coverId: string) {
  return sendWrite(client, "expire_unclaimed_cover", [coverId]);
}

export function registerPerilType(
  client: WriteClient,
  args: {
    name: string;
    adapter: string;
    description: string;
    minIndependentSources: bigint;
    maxPayoutFractionBps: bigint;
    premiumRateBps: bigint;
  }
) {
  return sendWrite(client, "register_peril_type", [
    args.name,
    args.adapter,
    args.description,
    args.minIndependentSources,
    args.maxPayoutFractionBps,
    args.premiumRateBps,
  ]);
}

export function setPerilTypeActive(
  client: WriteClient,
  perilTypeId: string,
  active: boolean
) {
  return sendWrite(client, "set_peril_type_active", [perilTypeId, active]);
}
