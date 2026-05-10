import { useState, useEffect } from "react";
import { api, type MotorConfig } from "@/lib/api";

interface ConfigPanelProps {
  currentMax: number;
  currentRamp: number;
  onApplied: (cfg: Partial<MotorConfig>) => void;
}

export function ConfigPanel({ currentMax, currentRamp, onApplied }: ConfigPanelProps) {
  const [maxSpeed, setMaxSpeed] = useState(currentMax);
  const [rampMs,   setRampMs]   = useState(currentRamp);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => { setMaxSpeed(currentMax); }, [currentMax]);
  useEffect(() => { setRampMs(currentRamp);  }, [currentRamp]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.setConfig({ max_speed: maxSpeed, ramp_ms: rampMs });
      onApplied({ max_speed: maxSpeed, ramp_ms: rampMs });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const label = "text-xs font-mono mb-1 block";
  const input = `
    w-full font-mono text-sm px-3 py-2 rounded
    bg-[var(--c-bg)] border border-[var(--c-border)]
    text-[var(--c-text)] focus:outline-none
    focus:border-[var(--c-accent)]
  `.trim();

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-5"
      style={{ background: "var(--c-panel)", border: "1px solid var(--c-border)" }}
    >
      <h2 className="text-xs font-mono tracking-widest" style={{ color: "var(--c-muted)" }}>
        CONFIG
      </h2>

      {/* Max speed */}
      <div>
        <label className={label} style={{ color: "var(--c-muted)" }}>
          Max speed (PWM 0–1023)
        </label>
        <input
          type="number" min={0} max={1023}
          value={maxSpeed}
          onChange={(e) => setMaxSpeed(Number(e.target.value))}
          className={input}
        />
        <input
          type="range" min={0} max={1023}
          value={maxSpeed}
          onChange={(e) => setMaxSpeed(Number(e.target.value))}
          className="w-full mt-2 accent-[var(--c-accent)]"
        />
      </div>

      {/* Ramp time */}
      <div>
        <label className={label} style={{ color: "var(--c-muted)" }}>
          Ramp time (ms)
        </label>
        <input
          type="number" min={0} max={30000} step={100}
          value={rampMs}
          onChange={(e) => setRampMs(Number(e.target.value))}
          className={input}
        />
        <input
          type="range" min={0} max={10000} step={100}
          value={rampMs}
          onChange={(e) => setRampMs(Number(e.target.value))}
          className="w-full mt-2 accent-[var(--c-accent)]"
        />
        <div className="text-xs mt-1" style={{ color: "var(--c-hint)" }}>
          {(rampMs / 1000).toFixed(1)}s to reach target
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-lg text-sm font-mono tracking-wider cursor-pointer"
        style={{
          background: saved ? "var(--c-ok)" : "var(--c-accent-dim)",
          color:      saved ? "#000"        : "var(--c-accent)",
          border:     `1px solid ${saved ? "var(--c-ok)" : "var(--c-accent)"}`,
          opacity:    saving ? 0.6 : 1,
          transition: "all 0.2s",
        }}
      >
        {saving ? "SAVING..." : saved ? "✓ SAVED" : "APPLY"}
      </button>
    </div>
  );
}
