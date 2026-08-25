"use client";

/**
 * A barometer dial: the needle sweeps from 0% to 100% of MAX_UTILIZATION_BPS as the pool's
 * reserved liability grows. This isn't decoration -- it's the same solvency ratio the contract
 * itself checks before accepting a new cover, drawn as the instrument this protocol is styled
 * after.
 */
export function PoolGauge({ ratio, label }: { ratio: number; label: string }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  // Sweep from -120deg to +120deg (240deg total arc)
  const angle = -120 + clamped * 240;
  const zoneColor = clamped > 0.85 ? "#C1483A" : clamped > 0.6 ? "#E3A33E" : "#3E8074";

  const ticks = Array.from({ length: 13 }, (_, i) => -120 + i * 20);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 160" className="w-full max-w-[260px]">
        <defs>
          <radialGradient id="dialFace" cx="50%" cy="65%" r="70%">
            <stop offset="0%" stopColor="#1C271F" />
            <stop offset="100%" stopColor="#131B16" />
          </radialGradient>
        </defs>
        <circle cx="110" cy="100" r="92" fill="url(#dialFace)" stroke="#2A362E" strokeWidth="1.5" />

        {ticks.map((t, i) => {
          const rad = (t * Math.PI) / 180;
          const x1 = 110 + 78 * Math.sin(rad);
          const y1 = 100 - 78 * Math.cos(rad);
          const x2 = 110 + (i % 3 === 0 ? 68 : 72) * Math.sin(rad);
          const y2 = 100 - (i % 3 === 0 ? 68 : 72) * Math.cos(rad);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#8B9690"
              strokeWidth={i % 3 === 0 ? 1.6 : 1}
              opacity={i % 3 === 0 ? 0.9 : 0.45}
            />
          );
        })}

        <text x="42" y="108" fill="#8B9690" fontSize="8" fontFamily="var(--font-plex-mono)">
          0
        </text>
        <text x="168" y="108" fill="#8B9690" fontSize="8" fontFamily="var(--font-plex-mono)">
          cap
        </text>

        <g transform={`rotate(${angle} 110 100)`} style={{ transition: "transform 900ms cubic-bezier(0.22,1,0.36,1)" }}>
          <line x1="110" y1="100" x2="110" y2="34" stroke={zoneColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="110" cy="100" r="6" fill={zoneColor} />
        </g>
        <circle cx="110" cy="100" r="2.5" fill="#101714" />
      </svg>
      <div className="-mt-2 text-center">
        <div className="font-mono text-2xl text-paper">{(clamped * 100).toFixed(1)}%</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{label}</div>
      </div>
    </div>
  );
}
