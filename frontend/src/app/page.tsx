"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getPoolSummary, listCovers, listPerilTypes } from "@/lib/contract";
import type { Cover, PerilType, PoolSummary } from "@/lib/types";
import { WalletBar } from "@/components/WalletBar";
import { PoolSummaryCard } from "@/components/PoolSummaryCard";
import { PerilCard } from "@/components/PerilCard";
import { OpenCoverForm } from "@/components/OpenCoverForm";
import { LiquidityPanel } from "@/components/LiquidityPanel";
import { CoversLedger } from "@/components/CoversLedger";
import { Notices, type Notice } from "@/components/Notices";

export default function Home() {
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [perils, setPerils] = useState<PerilType[]>([]);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [selectedPerilId, setSelectedPerilId] = useState<string | null>(null);
  const [loadingCovers, setLoadingCovers] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);

  const pushNotice = useCallback((message: string, ok: boolean) => {
    const id = Date.now() + Math.random();
    setNotices((prev) => [...prev, { id, message, ok }]);
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 7000);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [poolData, perilData] = await Promise.all([getPoolSummary(), listPerilTypes()]);
      setPool(poolData);
      setPerils(perilData);
      if (!selectedPerilId && perilData.length > 0) {
        setSelectedPerilId(perilData.find((p) => p.active)?.id ?? perilData[0].id);
      }
    } catch {
      // Studio may be cold-starting the contract; the UI just shows loading state.
    }
    try {
      setLoadingCovers(true);
      const list = await listCovers(0, 50);
      setCovers([...list].reverse());
    } catch {
      // ignore -- ledger stays empty
    } finally {
      setLoadingCovers(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 20000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const perilById = Object.fromEntries(perils.map((p) => [p.id, p]));
  const selectedPeril = selectedPerilId ? perilById[selectedPerilId] ?? null : null;

  function handleAction(msg: string, ok: boolean) {
    pushNotice(msg, ok);
    if (ok) setTimeout(refreshAll, 3000);
  }

  return (
    <main className="min-h-screen">
      <WalletBar />

      <section className="mx-auto max-w-6xl px-6 pb-24 pt-14 md:px-10">
        <div className="mb-12 max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal">
            parametric insurance, on GenLayer
          </p>
          <h1 className="mt-3 font-display text-4xl italic leading-tight text-paper md:text-5xl">
            One pool. Three perils.
            <br />
            Settled by consensus.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Weather thresholds, asset price crossings, and news events all draw against a single
            solvency-capped liquidity pool. Numeric adapters let the model read a number —
            never decide the payout; that comparison happens in this contract&rsquo;s own code.
          </p>
        </div>

        <PoolSummaryCard pool={pool} />

        <div className="mt-16">
          <SectionHeading eyebrow="Registry" title="Peril types" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {perils.map((p) => (
              <PerilCard key={p.id} peril={p} selected={p.id === selectedPerilId} onSelect={() => setSelectedPerilId(p.id)} />
            ))}
          </div>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel eyebrow="Open a position" title="Buy cover">
            <OpenCoverForm peril={selectedPeril} onSubmitted={handleAction} />
          </Panel>
          <Panel eyebrow="Underwrite" title="Liquidity">
            <LiquidityPanel onDone={handleAction} />
          </Panel>
        </div>

        <div className="mt-16">
          <SectionHeading eyebrow="Ledger" title="Covers" />
          <div className="rounded-2xl border border-line bg-surface">
            <CoversLedger
              covers={covers}
              perilById={perilById}
              loading={loadingCovers}
              onAction={handleAction}
            />
          </div>
        </div>

        <footer className="mt-20 border-t border-line pt-6 font-mono text-[11px] text-muted">
          Contract {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "not configured"} on{" "}
          {process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "studionet"}.
        </footer>
      </section>

      <Notices notices={notices} onDismiss={(id) => setNotices((prev) => prev.filter((n) => n.id !== id))} />
    </main>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{eyebrow}</span>
      <h2 className="font-display text-2xl italic text-paper">{title}</h2>
    </div>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 md:p-8">
      <SectionHeading eyebrow={eyebrow} title={title} />
      {children}
    </div>
  );
}
