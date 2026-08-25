"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatGen, formatIso, parseGen } from "@/lib/format";
import { executeWithdrawal, getLpPosition, provideLiquidity, requestWithdrawal } from "@/lib/contract";
import type { LPPositionView } from "@/lib/types";
import { useWallet } from "./WalletProvider";

export function LiquidityPanel({ onDone }: { onDone: (msg: string, ok: boolean) => void }) {
  const { address, getWriteClient } = useWallet();
  const [position, setPosition] = useState<LPPositionView | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [busy, setBusy] = useState<"deposit" | "request" | "execute" | null>(null);

  async function refresh(addr: string) {
    try {
      setPosition(await getLpPosition(addr));
    } catch {
      // no position yet, or read failed -- leave as null
    }
  }

  useEffect(() => {
    if (address) refresh(address);
    else setPosition(null);
  }, [address]);

  async function handleDeposit(e: FormEvent) {
    e.preventDefault();
    if (!address) return;
    setBusy("deposit");
    try {
      const client = await getWriteClient();
      const { hash } = await provideLiquidity(client, parseGen(depositAmount));
      onDone(`Liquidity provided — tx ${hash.slice(0, 10)}…`, true);
      setDepositAmount("");
      await refresh(address);
    } catch (err) {
      onDone(err instanceof Error ? err.message : "Deposit failed.", false);
    } finally {
      setBusy(null);
    }
  }

  async function handleRequestWithdrawal(e: FormEvent) {
    e.preventDefault();
    if (!address) return;
    setBusy("request");
    try {
      const client = await getWriteClient();
      const { hash } = await requestWithdrawal(client, BigInt(withdrawShares || "0"));
      onDone(`Withdrawal queued — tx ${hash.slice(0, 10)}…`, true);
      setWithdrawShares("");
      await refresh(address);
    } catch (err) {
      onDone(err instanceof Error ? err.message : "Could not queue withdrawal.", false);
    } finally {
      setBusy(null);
    }
  }

  async function handleExecute() {
    if (!address) return;
    setBusy("execute");
    try {
      const client = await getWriteClient();
      const { hash } = await executeWithdrawal(client);
      onDone(`Withdrawal executed — tx ${hash.slice(0, 10)}…`, true);
      await refresh(address);
    } catch (err) {
      onDone(err instanceof Error ? err.message : "Could not execute withdrawal.", false);
    } finally {
      setBusy(null);
    }
  }

  const pending = position?.pending_withdrawal;

  return (
    <div className="flex flex-col gap-6">
      {position && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-ink p-4 font-mono text-xs">
          <div>
            <div className="text-muted">Your shares</div>
            <div className="text-paper">{position.shares}</div>
          </div>
          <div>
            <div className="text-muted">Value</div>
            <div className="text-paper">{formatGen(position.value_wei)} GEN</div>
          </div>
        </div>
      )}

      <form onSubmit={handleDeposit} className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Provide liquidity (GEN)
        </span>
        <div className="flex gap-2">
          <input
            required
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="25"
            className="input flex-1"
          />
          <button type="submit" disabled={!address || busy !== null} className="btn-primary">
            {busy === "deposit" ? "Depositing…" : "Deposit"}
          </button>
        </div>
      </form>

      <div className="stub-edge pt-5">
        {pending ? (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              Pending withdrawal
            </span>
            <div className="rounded-lg border border-line bg-ink p-4 font-mono text-xs text-paper">
              <div>{pending.shares} shares queued</div>
              <div className="text-muted">requested {formatIso(pending.requested_at)}</div>
              <div className="text-muted">unlocks {formatIso(pending.unlock_at)}</div>
            </div>
            <button
              onClick={handleExecute}
              disabled={!address || busy !== null}
              className="btn-secondary self-start"
            >
              {busy === "execute" ? "Executing…" : "Execute withdrawal"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleRequestWithdrawal} className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              Queue a withdrawal (shares)
            </span>
            <div className="flex gap-2">
              <input
                required
                value={withdrawShares}
                onChange={(e) => setWithdrawShares(e.target.value)}
                placeholder="100"
                className="input flex-1"
              />
              <button type="submit" disabled={!address || busy !== null} className="btn-secondary">
                {busy === "request" ? "Queuing…" : "Queue"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
