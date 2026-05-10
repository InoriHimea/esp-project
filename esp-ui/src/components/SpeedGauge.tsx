import { useEffect, useRef } from "react";
import type { MotorState, MotorDirection } from "@/lib/api";

interface SpeedGaugeProps {
  speed:     number;   // 0–1023
  maxSpeed:  number;
  state:     MotorState;
  direction: MotorDirection;
}

const R  = 80;   // arc radius
const CX = 110;
const CY = 110;
const START_DEG = 225;
const SWEEP_DEG = 270;

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s   = polarToXY(cx, cy, r, startDeg);
  const e   = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function SpeedGauge({ speed, maxSpeed, state, direction }: SpeedGaugeProps) {
  const prevSpeed = useRef(speed);
  const pctFill = maxSpeed > 0 ? speed / maxSpeed : 0;
  const fillDeg = START_DEG + pctFill * SWEEP_DEG;

  const isActive = state === "running" || state === "ramping";
  const color    = direction === "forward" ? "var(--c-fwd)" : "var(--c-rev)";
  const stateLabel = state.toUpperCase();

  useEffect(() => { prevSpeed.current = speed; }, [speed]);

  const trackPath = arcPath(CX, CY, R, START_DEG, START_DEG + SWEEP_DEG);
  const fillPath  = pctFill > 0.001
    ? arcPath(CX, CY, R, START_DEG, fillDeg)
    : null;

  // Needle tip
  const needle = polarToXY(CX, CY, R - 10, fillDeg);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width="220"
        height="180"
        viewBox="0 0 220 180"
        className="overflow-visible"
      >
        {/* Tick marks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const deg = START_DEG + (i / 10) * SWEEP_DEG;
          const inner = polarToXY(CX, CY, R - 10, deg);
          const outer = polarToXY(CX, CY, R + 2,  deg);
          return (
            <line
              key={i}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke={i % 5 === 0 ? "var(--c-border-hi)" : "var(--c-hint)"}
              strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
            />
          );
        })}

        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="var(--c-border)"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Fill arc */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            style={{
              filter: isActive ? `drop-shadow(0 0 6px ${color})` : "none",
              transition: "stroke 0.3s",
            }}
          />
        )}

        {/* Needle dot */}
        {pctFill > 0.001 && (
          <circle
            cx={needle.x} cy={needle.y} r="5"
            fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        )}

        {/* Center hub */}
        <circle cx={CX} cy={CY} r="6"
          fill="var(--c-panel)" stroke="var(--c-border-hi)" strokeWidth="1.5" />

        {/* Speed number */}
        <text
          x={CX} y={CY - 14}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="32"
          fontWeight="700"
          fill={isActive ? color : "var(--c-muted)"}
          style={{ transition: "fill 0.3s" }}
        >
          {Math.round(pctFill * 100)}
        </text>
        <text
          x={CX} y={CY + 6}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--c-muted)"
        >
          %
        </text>

        {/* State label */}
        <text
          x={CX} y={CY + 38}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="10"
          letterSpacing="2"
          fill={isActive ? color : "var(--c-hint)"}
          style={{ transition: "fill 0.3s" }}
        >
          {stateLabel}
        </text>
      </svg>

      {/* Raw PWM */}
      <div className="text-xs font-mono" style={{ color: "var(--c-hint)" }}>
        PWM {speed} / {maxSpeed}
      </div>
    </div>
  );
}
