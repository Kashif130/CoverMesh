"use client";

import { bpsToPercent } from "@/lib/format";
import type { PerilType } from "@/lib/types";

const ADAPTER_META: Record<string, { glyph: string; tag: string; accent: string }> = {
  WEATHER: { glyph: "≈≈≈", tag: "Open-Meteo archive", accent: "text-ok" },
  PRICE_THRESHOLD: { glyph: "⌁⌁⌁", tag: "CoinGecko history", accent: "text-signal" },
  NEWS_EVENT: { glyph: "▤▤▤", tag: "News · GitHub · Wikipedia", accent: "text-paper" },
};

export function PerilCard({ peril, selected, onSelect }: { peril: PerilType; selected: boolean; onSelect: () => void }) {
  const meta = ADAPTER_META[peril.adapter] ?? ADAPTER_META.NEWS_EVENT;

  return (
    <button
      onClick={onSelect}
      disabled={!peril.active}
      className={`focus-ring flex w-full flex-col gap-3 rounded-xl border p-5 text-left transition ${
        selected ? "border-signal bg-surface2" : "border-line bg-surface hover:border-muted"
      } ${!peril.active ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-mono text-xs tracking-[0.15em] ${meta.accent}`}>{meta.glyph}</span>
        {!peril.active && (
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
            inactive
          </span>
        )}
      </div>
      <div>
        <div className="font-display text-lg text-paper">{peril.name}</div>
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{meta.tag}</div>
      </div>
      <p className="text-sm leading-snug text-muted">{peril.description}</p>
      <div className="mt-1 grid grid-cols-3 gap-2 border-t border-line pt-3 font-mono text-[11px] text-muted">
        <div>
          <div className="text-paper">{bpsToPercent(peril.premium_rate_bps)}</div>
          premium
        </div>
        <div>
          <div className="text-paper">{bpsToPercent(peril.max_payout_fraction_bps)}</div>
          per-cover cap
        </div>
        <div>
          <div className="text-paper">{peril.min_independent_sources}</div>
          min sources
        </div>
      </div>
      <div className="font-mono text-[10px] text-muted">{peril.id}</div>
    </button>
  );
}
