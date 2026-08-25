export function formatGen(wei: string | number | bigint, decimals = 4): string {
  try {
    const value = typeof wei === "bigint" ? wei : BigInt(wei);
    const whole = value / 10n ** 18n;
    const frac = value % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0.0000";
  }
}

export function parseGen(input: string): bigint {
  const [whole, frac = ""] = input.trim().split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  const wholeSafe = whole === "" || whole === "-" ? "0" : whole;
  return BigInt(wholeSafe) * 10n ** 18n + BigInt(fracPadded || "0");
}

export function bpsToPercent(bps: string | number): string {
  const n = typeof bps === "string" ? Number(bps) : bps;
  return `${(n / 100).toFixed(2)}%`;
}

export function shortAddr(addr: string, chars = 4): string {
  if (!addr || addr.length < chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

export function formatIso(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function nowIsoPlusDays(days: number): string {
  const d = new Date(Date.now() + days * 86400 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function utilizationRatio(reserved: string, nav: string, capBps: string): number {
  const navNum = Number(nav);
  const reservedNum = Number(reserved);
  const capBpsNum = Number(capBps);
  if (navNum <= 0 || capBpsNum <= 0) return 0;
  const cap = (navNum * capBpsNum) / 10000;
  if (cap <= 0) return 0;
  return Math.min(1, reservedNum / cap);
}
