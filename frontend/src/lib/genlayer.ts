import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { localnet, studionet, testnetAsimov } from "genlayer-js/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const CHAIN_MAP = {
  studionet,
  localnet,
  testnetAsimov,
} as const;

type ChainKey = keyof typeof CHAIN_MAP;

function resolveChain() {
  const key = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN as ChainKey) || "studionet";
  return CHAIN_MAP[key] ?? studionet;
}

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x0d8D6F00cF5F282a8aA00de6697071b3f2b14c20") as `0x${string}`;

const endpointOverride = process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT;

/**
 * A read-only client, safe to use before a wallet is connected. No account is attached,
 * so it can only call readContract.
 */
export function getReadClient() {
  return createClient({
    chain: resolveChain(),
    ...(endpointOverride ? { endpoint: endpointOverride } : {}),
  });
}

/**
 * A client bound to a browser-injected wallet (MetaMask or compatible), signing through
 * that extension's own provider. `account` is the connected address; `provider` is handed
 * to genlayer-js explicitly so it routes signing requests to the extension instead of
 * assuming one is auto-detected.
 */
export async function createInjectedClient(address: `0x${string}`) {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const client = createClient({
    chain: resolveChain(),
    account: address,
    provider,
    ...(endpointOverride ? { endpoint: endpointOverride } : {}),
  });
  return client;
}

/**
 * A client bound to a locally generated, non-custodial private key (never leaves this
 * browser's localStorage). Lets someone use the app fully without installing a wallet
 * extension -- signing happens directly against the generated key.
 */
export function createGeneratedClient(privateKey: `0x${string}`) {
  const account = createAccount(privateKey);
  return createClient({
    chain: resolveChain(),
    account,
    ...(endpointOverride ? { endpoint: endpointOverride } : {}),
  });
}

export { createAccount, generatePrivateKey };

export type WriteClient = Awaited<ReturnType<typeof createInjectedClient>>;
