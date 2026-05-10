import type { MotorDirection, MotorState } from "@/lib/api";

interface MotorWheelProps {
  state:     MotorState;
  direction: MotorDirection;
  speedPct:  number;  // 0–100
}

export function MotorWheel({ state, direction, speedPct }: MotorWheelProps) {
  const isSpinning = state === "running" || state === "ramping";
  const color      = direction === "forward" ? "var(--c-fwd)" : "var(--c-rev)";

  // Animation duration: faster as speed increases (min 0.3s at 100%)
  const dur = isSpinning && speedPct > 0
    ? Math.max(0.3, 2.5 - (speedPct / 100) * 2.2)
    : 0;

  const animClass = !isSpinning
    ? ""
    : direction === "forward"
    ? "animate-spin-fwd"
    : "animate-spin-rev";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative flex items-center justify-center rounded-full ${animClass}`}
        style={{
          width: 96,
          height: 96,
          border: `3px solid ${isSpinning ? color : "var(--c-border)"}`,
          boxShadow: isSpinning ? `0 0 16px ${color}55` : "none",
          background: "var(--c-panel)",
          transition: "border-color 0.3s, box-shadow 0.3s",
          animationDuration: dur > 0 ? `${dur}s` : undefined,
        }}
      >
        {/* Spokes */}
        {[0, 60, 120].map((deg) => (
          <div
            key={deg}
            className="absolute"
            style={{
              width: 2,
              height: "80%",
              background: isSpinning ? color : "var(--c-border-hi)",
              borderRadius: 1,
              transform: `rotate(${deg}deg)`,
              opacity: 0.7,
              transition: "background 0.3s",
            }}
          />
        ))}
        {/* Hub */}
        <div
          className="absolute rounded-full z-10"
          style={{
            width: 18, height: 18,
            background: isSpinning ? color : "var(--c-border-hi)",
            boxShadow: isSpinning ? `0 0 8px ${color}` : "none",
            transition: "background 0.3s, box-shadow 0.3s",
          }}
        />
      </div>

      <div className="text-xs font-mono" style={{ color: "var(--c-muted)" }}>
        {isSpinning
          ? direction === "forward" ? "↺ FORWARD" : "↻ REVERSE"
          : state === "braking" ? "⊠ BRAKING"
          : state === "coasting" ? "— COAST"
          : "■ STOPPED"
        }
      </div>
    </div>
  );
}
