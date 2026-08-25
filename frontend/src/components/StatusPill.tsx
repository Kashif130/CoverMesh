const STYLES: Record<string, string> = {
  TRIGGERED: "bg-triggered/15 text-triggered border-triggered/40",
  NOT_TRIGGERED: "bg-ok/15 text-ok border-ok/40",
  INSUFFICIENT_EVIDENCE: "bg-signal/15 text-signal border-signal/40",
  EXPIRED_VOID: "bg-muted/15 text-muted border-muted/40",
  OPEN: "bg-paper/10 text-paper border-line",
};

export function StatusPill({ status }: { status: string }) {
  const label = status || "OPEN";
  const cls = STYLES[label] ?? STYLES.OPEN;
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${cls}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}
