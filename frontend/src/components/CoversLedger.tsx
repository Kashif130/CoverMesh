"use client";

import { useState } from "react";
import type { Cover, PerilType } from "@/lib/types";
import { formatGen, formatIso, shortAddr } from "@/lib/format";
import { checkClaim, expireUnclaimedCover } from "@/lib/contract";
import { StatusPill } from "./StatusPill";
import { useWallet } from "./WalletProvider";

export function CoversLedger({
  covers,
  perilById,
  loading,
  onAction,
}: {
  covers: Cover[];
  perilById: Record<string, PerilType>;
  loading: boolean;
  onAction: (msg: string, ok: boolean) => void;
}) {
  const { address, getWriteClient } = useWallet();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCheck(id: string) {
    if (!address) return;
    setBusyId(id);
    try {
      const client = await getWriteClient();
      const { hash } = await checkClaim(client, id);
      onAction(`Claim check submitted — tx ${hash.slice(0, 10)}…`, true);
    } catch (err) {
      onAction(err instanceof Error ? err.message : "Claim check failed.", false);
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpire(id: string) {
    if (!address) return;
    setBusyId(id);
    try {
      const client = await getWriteClient();
      const { hash } = await expireUnclaimedCover(client, id);
      onAction(`Cover expired — tx ${hash.slice(0, 10)}…`, true);
    } catch (err) {
      onAction(err instanceof Error ? err.message : "Could not expire cover.", false);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="p-8 font-mono text-sm text-muted">Reading the ledger…</div>;
  }

  if (covers.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="font-display text-lg italic text-paper">No covers yet.</div>
        <p className="mt-1 text-sm text-muted">Open the first one above.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {covers.map((c) => {
        const peril = perilById[c.peril_type_id];
        const isOpen = openId === c.id;
        return (
          <div key={c.id}>
            <button
              onClick={() => setOpenId(isOpen ? null : c.id)}
              className="focus-ring flex w-full flex-wrap items-center gap-3 px-6 py-4 text-left transition hover:bg-surface2 md:flex-nowrap"
            >
              <span className="font-mono text-xs text-muted">{c.id}</span>
              <span className="min-w-0 flex-1 truncate font-display text-base text-paper">{c.subject}</span>
              <span className="font-mono text-[11px] text-muted">{peril?.name ?? c.peril_type_id}</span>
              <span className="font-mono text-xs text-paper">{formatGen(c.coverage_amount)} GEN</span>
              <StatusPill status={c.resolved ? c.resolution_status : "OPEN"} />
            </button>

            {isOpen && (
              <div className="grid gap-6 bg-ink px-6 py-6 md:grid-cols-2">
                <dl className="flex flex-col gap-2 font-mono text-xs">
                  <Row k="Beneficiary" v={shortAddr(c.beneficiary)} />
                  <Row k="Window" v={`${formatIso(c.window_start)} → ${formatIso(c.window_end)}`} />
                  <Row k="Keywords" v={c.keywords} />
                  {c.threshold_value && (
                    <Row
                      k="Threshold"
                      v={`${c.threshold_metric || "value"} ${c.threshold_comparator} ${c.threshold_value}`}
                    />
                  )}
                  {c.asset_id && <Row k="Asset" v={c.asset_id} />}
                  {c.allowed_outcomes.length > 0 && <Row k="Outcomes" v={c.allowed_outcomes.join(", ")} />}
                  {c.triggering_outcomes.length > 0 && (
                    <Row k="Triggering" v={c.triggering_outcomes.join(", ")} />
                  )}
                  <Row k="Premium paid" v={`${formatGen(c.premium_paid)} GEN`} />
                  <Row k="Check attempts" v={String(c.check_attempts)} />
                  {c.resolved && <Row k="Payout" v={`${formatGen(c.payout_amount)} GEN`} />}
                </dl>

                <div className="flex flex-col gap-3">
                  {c.extracted_reading && (
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                        Extracted reading
                      </div>
                      <div className="font-mono text-sm text-signal">{c.extracted_reading}</div>
                    </div>
                  )}
                  {c.rationale && (
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Rationale</div>
                      <p className="text-sm text-muted">{c.rationale}</p>
                    </div>
                  )}
                  <div className="mt-auto flex gap-2 pt-2">
                    {!c.resolved && (
                      <>
                        <button
                          onClick={() => handleCheck(c.id)}
                          disabled={!address || busyId === c.id}
                          className="btn-primary"
                        >
                          {busyId === c.id ? "Checking…" : "Check claim"}
                        </button>
                        <button
                          onClick={() => handleExpire(c.id)}
                          disabled={!address || busyId === c.id}
                          className="btn-secondary"
                        >
                          Expire (past grace period)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/50 pb-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-paper">{v}</dd>
    </div>
  );
}
