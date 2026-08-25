"use client";

import { PoolGauge } from "./PoolGauge";
import { formatGen, bpsToPercent, utilizationRatio } from "@/lib/format";
import type { PoolSummary } from "@/lib/types";

export function PoolSummaryCard({ pool }: { pool: PoolSummary | null }) {
  if (!pool) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 font-mono text-sm text-muted">
        Reading pool state…
      </div>
    );
  }

  const ratio = utilizationRatio(pool.reserved_liability, pool.pool_nav, pool.max_utilization_bps);

  const rows: [string, string][] = [
    ["Pool NAV", `${formatGen(pool.pool_nav)} GEN`],
    ["Reserved liability", `${formatGen(pool.reserved_liability)} GEN`],
    ["Available capacity", `${formatGen(pool.available_capacity)} GEN`],
    ["Utilization cap", bpsToPercent(pool.max_utilization_bps)],
    ["Open + settled covers", String(pool.cover_count)],
    ["Withdrawal lock-up", `${Math.round(Number(pool.withdrawal_lockup_seconds) / 86400)} days`],
  ];

  return (
    <div className="grid gap-8 rounded-2xl border border-line bg-surface p-6 md:grid-cols-[220px_1fr] md:p-8">
      <PoolGauge ratio={ratio} label="of solvency cap in use" />
      <div className="flex flex-col justify-center gap-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between border-b border-line/60 pb-2">
            <span className="text-sm text-muted">{label}</span>
            <span className="font-mono text-sm text-paper">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
