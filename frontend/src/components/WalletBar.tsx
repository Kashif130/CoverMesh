"use client";

import { useEffect, useRef, useState } from "react";
import { shortAddr } from "@/lib/format";
import { useWallet } from "./WalletProvider";

export function WalletBar() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleConnectInjected() {
    setMessage(null);
    await wallet.connectInjected();
    setMessage(wallet.error ? null : "Injected wallet connected.");
  }

  function handleUseGenerated() {
    wallet.useGenerated();
    setMessage("Browser wallet ready.");
  }

  function handleCopyKey() {
    const key = wallet.exportPrivateKey();
    if (!key) {
      setMessage("No browser wallet key is active yet.");
      return;
    }
    navigator.clipboard.writeText(key);
    setMessage("Private key copied. This is non-custodial: store it yourself. CoverMesh never sees it.");
  }

  function handleDisconnect() {
    wallet.disconnect();
    setMessage("Disconnected. A saved browser wallet key stays in this browser's storage.");
  }

  function handleImport() {
    wallet.importGenerated(importValue.trim() as `0x${string}`);
    setImportValue("");
    setMessage("Imported.");
  }

  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-5 md:px-10">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl italic tracking-tight text-paper">CoverMesh</span>
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted md:inline">
          shared pool · three adapters
        </span>
      </div>

      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="focus-ring group flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-mono text-xs text-paper transition hover:border-signal"
        >
          {wallet.address ? (
            <>
              <span className="h-2 w-2 rounded-full bg-ok" />
              {shortAddr(wallet.address)}
            </>
          ) : (
            <span>{wallet.connecting ? "Connecting…" : "Connect wallet"}</span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 z-20 mt-3 w-80 rounded-2xl border border-line bg-surface p-4 shadow-xl">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Active identity</span>
            <div className="mt-1 break-all font-mono text-sm text-paper">
              {wallet.address ?? "Browsing read-only"}
            </div>
            {wallet.mode !== "none" && (
              <div className="mt-1 font-mono text-[11px] text-muted">
                {wallet.mode === "injected" ? "Injected wallet" : "Browser wallet (generated)"}
              </div>
            )}

            <div className="mt-4 grid gap-2">
              <button onClick={handleUseGenerated} className="btn-secondary w-full">
                Use browser wallet
              </button>
              <button onClick={handleConnectInjected} className="btn-secondary w-full">
                Use injected wallet
              </button>
              <button onClick={handleCopyKey} className="btn-secondary w-full">
                Export browser key
              </button>
              {wallet.mode !== "none" && (
                <button onClick={handleDisconnect} className="btn-secondary w-full">
                  Disconnect
                </button>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-signal/40 bg-signal/10 p-3 font-mono text-[11px] leading-relaxed text-signal">
              The browser wallet is a locally generated key, non-custodial, stored only in this
              browser&rsquo;s local storage. Export and back it up before relying on it — losing it
              means losing access to covers opened with it.
            </div>

            <label className="mt-4 block" htmlFor="import-key">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                Import browser key
              </span>
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="import-key"
                className="input flex-1"
                value={importValue}
                onChange={(e) => setImportValue(e.target.value)}
                placeholder="0x…"
              />
              <button onClick={handleImport} className="btn-secondary px-3">
                Go
              </button>
            </div>

            {(message || wallet.error) && (
              <p className="mt-3 font-mono text-[11px] text-muted" aria-live="polite">
                {wallet.error ?? message}
              </p>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
