"use client";

export interface Notice {
  id: number;
  message: string;
  ok: boolean;
}

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: number) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {notices.map((n) => (
        <button
          key={n.id}
          onClick={() => onDismiss(n.id)}
          className={`focus-ring max-w-sm rounded-lg border px-4 py-3 text-left font-mono text-xs shadow-lg backdrop-blur ${
            n.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-triggered/40 bg-triggered/10 text-triggered"
          }`}
        >
          {n.message}
        </button>
      ))}
    </div>
  );
}
