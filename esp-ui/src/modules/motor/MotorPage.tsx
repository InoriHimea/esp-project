import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useDeviceWs } from '../../ws/useDeviceWs';
import { sendDeviceCommand } from '../../api/devices';
import { normalizeMotorDirection, normalizeMotorState, numberValue, stringValue } from '../../types/devices';
import { SpeedGauge } from '../../components/SpeedGauge';
import { MotorWheel } from '../../components/MotorWheel';
import { ConfigPanel } from '../../components/ConfigPanel';
import type { MotorState, MotorDirection } from '../../lib/api';

// ─── Default config (local state, no separate config endpoint via server) ─────
const DEFAULT_MAX_SPEED = 1023;
const DEFAULT_RAMP_MS   = 1000;

export default function MotorPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const deviceMap    = useDeviceWs();
  const status       = deviceId ? deviceMap.get(deviceId) : undefined;

  // Local config state (max_speed / ramp_ms are sent with each command)
  const [maxSpeed, setMaxSpeed] = useState(DEFAULT_MAX_SPEED);
  const [rampMs,   setRampMs]   = useState(DEFAULT_RAMP_MS);
  const [speed,    setSpeed]    = useState(512);
  const [direction, setDirection] = useState<MotorDirection>('forward');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const sendCommand = useCallback(async (payload: { cmd: 'run' | 'stop' | 'brake' | 'coast'; speed?: number; direction?: MotorDirection; ramp_ms?: number }) => {
    if (!deviceId) return;
    setSending(true);
    setError(null);
    try {
      await sendDeviceCommand(deviceId, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setSending(false);
    }
  }, [deviceId]);

  const handleRun = () =>
    sendCommand({ cmd: 'run', speed, direction, ramp_ms: rampMs });

  const handleStop  = () => sendCommand({ cmd: 'stop' });
  const handleBrake = () => sendCommand({ cmd: 'brake' });
  const handleCoast = () => sendCommand({ cmd: 'coast' });

  // Derive display values from live status or fall back to local state
  const normalizedState  = status ? normalizeMotorState(status.state) : 'stopped';
  const displayState     = normalizedState === 'unknown' ? 'stopped' : normalizedState;
  const displayDirection = status ? normalizeMotorDirection(status.direction) : direction;
  const displaySpeed     = numberValue(status?.speed);
  const displaySpeedPct  = status ? parseFloat(stringValue(status.speed_pct, '0')) : 0;
  const displayUptime    = numberValue(status?.uptime_ms);
  const displayIp        = stringValue(status?.ip, '—');

  const btnBase = 'flex-1 py-2.5 rounded-lg text-sm font-mono tracking-wider cursor-pointer transition-all disabled:opacity-50';

  return (
    <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-mono tracking-widest" style={{ color: 'var(--c-text)' }}>
          MOTOR <span style={{ color: 'var(--c-accent)' }}>{deviceId}</span>
        </h1>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--c-muted)' }}>
          <span
            style={{
              display: 'inline-block',
              width: 7, height: 7,
              borderRadius: '50%',
              background: status ? 'var(--c-ok)' : 'var(--c-rev)',
              boxShadow: status ? '0 0 6px var(--c-ok)' : 'none',
            }}
          />
          {status ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* Status info bar */}
      <div
        className="flex items-center gap-4 px-4 py-2 text-xs font-mono rounded-lg flex-wrap"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <span style={{ color: 'var(--c-muted)' }}>
          <span style={{ color: 'var(--c-hint)' }}>IP </span>{displayIp}
        </span>
        {displayUptime > 0 && (
          <span style={{ color: 'var(--c-muted)' }}>
            <span style={{ color: 'var(--c-hint)' }}>UP </span>
            {Math.floor(displayUptime / 1000)}s
          </span>
        )}
        <span style={{ color: 'var(--c-muted)' }}>
          <span style={{ color: 'var(--c-hint)' }}>STATE </span>
          {displayState.toUpperCase()}
        </span>
      </div>

      {/* Gauges */}
      <div
        className="rounded-xl p-5 flex flex-col sm:flex-row items-center justify-around gap-6"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <SpeedGauge
          speed={displaySpeed}
          maxSpeed={maxSpeed}
          state={displayState}
          direction={displayDirection}
        />
        <MotorWheel
          state={displayState}
          direction={displayDirection}
          speedPct={displaySpeedPct}
        />
      </div>

      {/* Controls */}
      <div
        className="rounded-xl p-5 flex flex-col gap-5"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <h2 className="text-xs font-mono tracking-widest" style={{ color: 'var(--c-muted)' }}>
          CONTROLS
        </h2>

        {/* Speed slider */}
        <div>
          <label className="text-xs font-mono mb-1 block" style={{ color: 'var(--c-muted)' }}>
            Speed (PWM 0–{maxSpeed})
          </label>
          <input
            type="range" min={0} max={maxSpeed}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-[var(--c-accent)]"
          />
          <div className="text-xs font-mono mt-1" style={{ color: 'var(--c-hint)' }}>
            {speed} / {maxSpeed} ({maxSpeed > 0 ? Math.round((speed / maxSpeed) * 100) : 0}%)
          </div>
        </div>

        {/* Direction toggle */}
        <div className="flex gap-3">
          {(['forward', 'reverse'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`${btnBase} border`}
              style={{
                background: direction === d ? 'var(--c-accent-dim)' : 'transparent',
                color:      direction === d ? 'var(--c-accent)' : 'var(--c-muted)',
                border:     `1px solid ${direction === d ? 'var(--c-accent)' : 'var(--c-border)'}`,
              }}
            >
              {d === 'forward' ? '↺ FORWARD' : '↻ REVERSE'}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleRun}
            disabled={sending}
            className={btnBase}
            style={{
              background: 'var(--c-accent-dim)',
              color: 'var(--c-accent)',
              border: '1px solid var(--c-accent)',
            }}
          >
            ▶ RUN
          </button>
          <button
            onClick={handleStop}
            disabled={sending}
            className={btnBase}
            style={{
              background: 'transparent',
              color: 'var(--c-muted)',
              border: '1px solid var(--c-border)',
            }}
          >
            ■ STOP
          </button>
          <button
            onClick={handleBrake}
            disabled={sending}
            className={btnBase}
            style={{
              background: 'transparent',
              color: 'var(--c-rev)',
              border: '1px solid var(--c-rev)',
            }}
          >
            ⊠ BRAKE
          </button>
          <button
            onClick={handleCoast}
            disabled={sending}
            className={btnBase}
            style={{
              background: 'transparent',
              color: 'var(--c-muted)',
              border: '1px solid var(--c-border)',
            }}
          >
            — COAST
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            className="text-xs font-mono px-3 py-2 rounded"
            style={{ background: 'var(--c-rev-dim, #3b0000)', color: 'var(--c-rev)', border: '1px solid var(--c-rev)' }}
          >
            ✕ {error}
          </div>
        )}
      </div>

      {/* Config panel — local only, values used in next RUN command */}
      <ConfigPanel
        currentMax={maxSpeed}
        currentRamp={rampMs}
        onApplied={(cfg) => {
          if (cfg.max_speed !== undefined) setMaxSpeed(cfg.max_speed);
          if (cfg.ramp_ms  !== undefined) setRampMs(cfg.ramp_ms);
        }}
      />
    </div>
  );
}
