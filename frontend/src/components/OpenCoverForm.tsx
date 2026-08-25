"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { PerilType } from "@/lib/types";
import { WEATHER_METRICS } from "@/lib/types";
import { formatGen, parseGen } from "@/lib/format";
import { openCover } from "@/lib/contract";
import { useWallet } from "./WalletProvider";

function toIsoUtcSeconds(localDatetimeValue: string): string {
  if (!localDatetimeValue) return "";
  const d = new Date(localDatetimeValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function OpenCoverForm({
  peril,
  onSubmitted,
}: {
  peril: PerilType | null;
  onSubmitted: (msg: string, ok: boolean) => void;
}) {
  const { address, getWriteClient } = useWallet();
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLon, setLocationLon] = useState("");
  const [thresholdMetric, setThresholdMetric] = useState<string>(WEATHER_METRICS[0]);
  const [thresholdComparator, setThresholdComparator] = useState(">=");
  const [thresholdValue, setThresholdValue] = useState("");
  const [assetId, setAssetId] = useState("");
  const [allowedOutcomes, setAllowedOutcomes] = useState("");
  const [triggeringOutcomes, setTriggeringOutcomes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const coverageWei = useMemo(() => {
    try {
      return parseGen(coverageAmount || "0");
    } catch {
      return 0n;
    }
  }, [coverageAmount]);

  const premiumWei = useMemo(() => {
    if (!peril) return 0n;
    return (coverageWei * BigInt(peril.premium_rate_bps)) / 10000n;
  }, [coverageWei, peril]);

  const disabled = !peril || !address || submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!peril || !address) return;
    setSubmitting(true);
    try {
      const client = await getWriteClient();
      const { hash } = await openCover(client, {
        perilTypeId: peril.id,
        subject,
        keywords,
        windowStart: toIsoUtcSeconds(windowStart),
        windowEnd: toIsoUtcSeconds(windowEnd),
        coverageAmount: coverageWei,
        premiumWei,
        locationLat: peril.adapter === "WEATHER" ? locationLat : "",
        locationLon: peril.adapter === "WEATHER" ? locationLon : "",
        thresholdMetric: peril.adapter === "WEATHER" ? thresholdMetric : "",
        thresholdComparator: peril.adapter === "WEATHER" ? ">=" : peril.adapter === "PRICE_THRESHOLD" ? thresholdComparator : "",
        thresholdValue: peril.adapter !== "NEWS_EVENT" ? thresholdValue : "",
        assetId: peril.adapter === "PRICE_THRESHOLD" ? assetId : "",
        allowedOutcomes:
          peril.adapter === "NEWS_EVENT"
            ? allowedOutcomes.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        triggeringOutcomes:
          peril.adapter === "NEWS_EVENT"
            ? triggeringOutcomes.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
      });
      onSubmitted(`Cover opened — tx ${hash.slice(0, 10)}…`, true);
      setSubject("");
      setKeywords("");
      setCoverageAmount("");
      setThresholdValue("");
      setAssetId("");
      setAllowedOutcomes("");
      setTriggeringOutcomes("");
    } catch (err) {
      onSubmitted(err instanceof Error ? err.message : "Could not open cover.", false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject">
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Heathrow terminal 5 flood risk"
            className="input"
          />
        </Field>
        <Field label="Keywords (used to search corroborating evidence)">
          <input
            required
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Heathrow flooding terminal"
            className="input"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Window start (your local time)">
          <input
            required
            type="datetime-local"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Window end (your local time)">
          <input
            required
            type="datetime-local"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            className="input"
          />
        </Field>
      </div>

      {peril?.adapter === "WEATHER" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude">
            <input required value={locationLat} onChange={(e) => setLocationLat(e.target.value)} placeholder="51.47" className="input" />
          </Field>
          <Field label="Longitude">
            <input required value={locationLon} onChange={(e) => setLocationLon(e.target.value)} placeholder="-0.45" className="input" />
          </Field>
          <Field label="Metric">
            <select value={thresholdMetric} onChange={(e) => setThresholdMetric(e.target.value)} className="input">
              {WEATHER_METRICS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trigger if reading ≥">
            <input required value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} placeholder="50" className="input" />
          </Field>
        </div>
      )}

      {peril?.adapter === "PRICE_THRESHOLD" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Asset id (CoinGecko)">
            <input required value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="bitcoin" className="input" />
          </Field>
          <Field label="Comparator">
            <select value={thresholdComparator} onChange={(e) => setThresholdComparator(e.target.value)} className="input">
              <option value=">=">≥ (price rises to)</option>
              <option value="<=">≤ (price falls to)</option>
            </select>
          </Field>
          <Field label="Threshold (USD)">
            <input required value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} placeholder="50000" className="input" />
          </Field>
        </div>
      )}

      {peril?.adapter === "NEWS_EVENT" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Allowed outcomes (comma-separated, 2–6)">
            <input
              required
              value={allowedOutcomes}
              onChange={(e) => setAllowedOutcomes(e.target.value)}
              placeholder="DELIVERED, DELAYED, CANCELLED"
              className="input"
            />
          </Field>
          <Field label="Triggering outcomes (subset of the above)">
            <input
              required
              value={triggeringOutcomes}
              onChange={(e) => setTriggeringOutcomes(e.target.value)}
              placeholder="DELAYED, CANCELLED"
              className="input"
            />
          </Field>
        </div>
      )}

      <Field label="Coverage amount (GEN)">
        <input
          required
          value={coverageAmount}
          onChange={(e) => setCoverageAmount(e.target.value)}
          placeholder="10"
          className="input"
        />
      </Field>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="font-mono text-xs text-muted">
          Premium due: <span className="text-signal">{formatGen(premiumWei)} GEN</span>
        </div>
        <button type="submit" disabled={disabled} className="btn-primary">
          {submitting ? "Opening…" : !address ? "Connect wallet" : !peril ? "Select a peril" : "Open cover"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{label}</span>
      {children}
    </label>
  );
}
