"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createAccount,
  createGeneratedClient,
  createInjectedClient,
  generatePrivateKey,
  type WriteClient,
} from "@/lib/genlayer";
import {
  acknowledgeGeneratedWallet,
  hasAcknowledgedGeneratedWallet,
  readGeneratedKey,
  writeGeneratedKey,
} from "@/lib/storage";

type WalletMode = "none" | "generated" | "injected";

type WalletContextValue = {
  mode: WalletMode;
  address: `0x${string}` | null;
  connecting: boolean;
  error: string | null;
  warningAccepted: boolean;
  connectInjected: () => Promise<void>;
  useGenerated: () => void;
  importGenerated: (privateKey: `0x${string}`) => void;
  disconnect: () => void;
  exportPrivateKey: () => `0x${string}` | null;
  /** Resolves to a client that can sign writes for whichever mode is active. Throws if
   * no wallet is connected yet. */
  getWriteClient: () => Promise<WriteClient>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WalletMode>("none");
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [privateKey, setPrivateKey] = useState<`0x${string}` | null>(null);
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a previously-generated browser wallet on load, if one exists.
  useEffect(() => {
    const stored = readGeneratedKey();
    if (stored) {
      const account = createAccount(stored);
      setMode("generated");
      setAddress(account.address);
      setPrivateKey(stored);
      setWarningAccepted(hasAcknowledgedGeneratedWallet());
      return;
    }
    setWarningAccepted(hasAcknowledgedGeneratedWallet());
  }, []);

  // Track account switches in an already-connected injected wallet.
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      if (mode !== "injected") return;
      setAddress(list?.[0] ? (list[0] as `0x${string}`) : null);
    };
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    return () => window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
  }, [mode]);

  const connectInjected = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No injected wallet found. Install MetaMask or a compatible browser wallet.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      if (!accounts?.[0]) throw new Error("No wallet account was returned.");
      setAddress(accounts[0]);
      setMode("injected");
    } catch {
      setError("Connection request was rejected.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const useGenerated = useCallback(() => {
    let key = readGeneratedKey();
    if (!key) {
      key = generatePrivateKey();
      writeGeneratedKey(key);
    }
    acknowledgeGeneratedWallet();
    const account = createAccount(key);
    setPrivateKey(key);
    setAddress(account.address);
    setWarningAccepted(true);
    setMode("generated");
    setError(null);
  }, []);

  const importGenerated = useCallback((key: `0x${string}`) => {
    try {
      const account = createAccount(key);
      writeGeneratedKey(key);
      acknowledgeGeneratedWallet();
      setPrivateKey(key);
      setAddress(account.address);
      setWarningAccepted(true);
      setMode("generated");
      setError(null);
    } catch {
      setError("That doesn't look like a valid private key.");
    }
  }, []);

  const disconnect = useCallback(() => {
    setMode("none");
    setAddress(null);
    setPrivateKey(null);
  }, []);

  const exportPrivateKey = useCallback(() => privateKey, [privateKey]);

  const getWriteClient = useCallback(async (): Promise<WriteClient> => {
    if (mode === "injected" && address) return createInjectedClient(address);
    if (mode === "generated" && privateKey) return createGeneratedClient(privateKey) as unknown as WriteClient;
    throw new Error("Connect a wallet or use a browser wallet before sending a transaction.");
  }, [address, mode, privateKey]);

  const value = useMemo<WalletContextValue>(
    () => ({
      mode,
      address,
      connecting,
      error,
      warningAccepted,
      connectInjected,
      useGenerated,
      importGenerated,
      disconnect,
      exportPrivateKey,
      getWriteClient,
    }),
    [
      mode,
      address,
      connecting,
      error,
      warningAccepted,
      connectInjected,
      useGenerated,
      importGenerated,
      disconnect,
      exportPrivateKey,
      getWriteClient,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside a WalletProvider");
  return value;
}
