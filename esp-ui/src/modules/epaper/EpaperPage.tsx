import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { sendDeviceCommand } from '../../api/devices';
import { useDeviceWs } from '../../ws/useDeviceWs';
import {
  normalizeEpaperPanelType,
  numberValue,
  stringValue,
  type EpaperCommand,
} from '../../types/devices';

const btnBase = 'flex-1 py-2.5 rounded-lg text-sm font-mono tracking-wider cursor-pointer transition-all disabled:opacity-50';

export default function EpaperPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const deviceMap = useDeviceWs();
  const status = deviceId ? deviceMap.get(deviceId) : undefined;

  const [text, setText] = useState('Hello ESP32');
  const [x, setX] = useState(0);
  const [y, setY] = useState(24);
  const [size, setSize] = useState(2);
  const [color, setColor] = useState('black');
  const [refresh, setRefresh] = useState<'full' | 'partial'>('full');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCommand = useCallback(async (command: EpaperCommand) => {
    if (!deviceId) return;
    setSending(true);
    setError(null);
    try {
      await sendDeviceCommand(deviceId, command);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setSending(false);
    }
  }, [deviceId]);

  const panelType = normalizeEpaperPanelType(status?.panel_type);
  const panelModel = stringValue(status?.panel_model, 'unknown');
  const width = numberValue(status?.width);
  const height = numberValue(status?.height);
  const busy = status?.busy === true;
  const state = stringValue(status?.state, busy ? 'refreshing' : 'idle');
  const uptime = numberValue(status?.uptime_ms);
  const ip = stringValue(status?.ip, '—');
  const lastRefresh = numberValue(status?.last_refresh_ms);
  const refreshCount = numberValue(status?.refresh_count);
  const batteryMv = numberValue(status?.battery_mv);
  const palette = Array.isArray(status?.palette) ? status.palette.join(' / ') : panelType === 'color' ? 'color' : 'white / black';

  return (
    <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-mono tracking-widest" style={{ color: 'var(--c-text)' }}>
          EPAPER <span style={{ color: 'var(--c-accent)' }}>{deviceId}</span>
        </h1>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--c-muted)' }}>
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: status ? 'var(--c-ok)' : 'var(--c-rev)',
              boxShadow: status ? '0 0 6px var(--c-ok)' : 'none',
            }}
          />
          {status ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      <div
        className="flex items-center gap-4 px-4 py-2 text-xs font-mono rounded-lg flex-wrap"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <span style={{ color: 'var(--c-muted)' }}>
          <span style={{ color: 'var(--c-hint)' }}>IP </span>{ip}
        </span>
        {uptime > 0 && (
          <span style={{ color: 'var(--c-muted)' }}>
            <span style={{ color: 'var(--c-hint)' }}>UP </span>{Math.floor(uptime / 1000)}s
          </span>
        )}
        <span style={{ color: busy ? 'var(--c-warn)' : 'var(--c-ok)' }}>
          <span style={{ color: 'var(--c-hint)' }}>STATE </span>{state.toUpperCase()}
        </span>
      </div>

      <div
        className="rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-3"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <InfoTile label="Panel" value={panelType === 'mono' ? 'Mono' : panelType === 'color' ? 'Color' : 'Unknown'} sub={panelModel} />
        <InfoTile label="Size" value={width && height ? `${width}×${height}` : '—'} />
        <InfoTile label="Palette" value={palette} />
        <InfoTile label="Refresh" value={refreshCount || '—'} sub={lastRefresh ? `${lastRefresh} ms` : undefined} />
        {batteryMv > 0 && <InfoTile label="Battery" value={`${batteryMv} mV`} />}
      </div>

      <div
        className="rounded-xl p-5 flex flex-col gap-5"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <h2 className="text-xs font-mono tracking-widest" style={{ color: 'var(--c-muted)' }}>
          TEXT RENDER
        </h2>

        <label className="text-xs font-mono flex flex-col gap-1" style={{ color: 'var(--c-muted)' }}>
          Text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <NumberInput label="X" value={x} onChange={setX} />
          <NumberInput label="Y" value={y} onChange={setY} />
          <NumberInput label="Size" value={size} onChange={setSize} min={1} max={8} />
          <SelectInput label="Color" value={color} onChange={setColor} options={['black', 'white', 'red', 'yellow']} />
          <SelectInput label="Refresh" value={refresh} onChange={(v) => setRefresh(v as 'full' | 'partial')} options={['full', 'partial']} />
        </div>

        <button
          onClick={() => sendCommand({ cmd: 'display_text', text, x, y, size, color, refresh })}
          disabled={sending || text.trim() === ''}
          className={btnBase}
          style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)', border: '1px solid var(--c-accent)' }}
        >
          DISPLAY TEXT
        </button>
      </div>

      <div
        className="rounded-xl p-5 flex flex-col gap-4"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <h2 className="text-xs font-mono tracking-widest" style={{ color: 'var(--c-muted)' }}>
          CONTROLS
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => sendCommand({ cmd: 'clear', color: 'white', refresh })} disabled={sending} className={btnBase} style={{ background: 'transparent', color: 'var(--c-muted)', border: '1px solid var(--c-border)' }}>
            CLEAR
          </button>
          <button onClick={() => sendCommand({ cmd: 'refresh', mode: 'full' })} disabled={sending} className={btnBase} style={{ background: 'transparent', color: 'var(--c-accent)', border: '1px solid var(--c-accent)' }}>
            REFRESH
          </button>
          <button onClick={() => sendCommand({ cmd: 'sleep' })} disabled={sending} className={btnBase} style={{ background: 'transparent', color: 'var(--c-warn)', border: '1px solid var(--c-warn)' }}>
            SLEEP
          </button>
          <button onClick={() => sendCommand({ cmd: 'wake' })} disabled={sending} className={btnBase} style={{ background: 'transparent', color: 'var(--c-ok)', border: '1px solid var(--c-ok)' }}>
            WAKE
          </button>
        </div>

        {error && (
          <div
            className="text-xs font-mono px-3 py-2 rounded"
            style={{ background: 'var(--c-rev-dim, #3b0000)', color: 'var(--c-rev)', border: '1px solid var(--c-rev)' }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3 min-w-0">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white truncate">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1 truncate">{sub}</p>}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="text-xs font-mono flex flex-col gap-1" style={{ color: 'var(--c-muted)' }}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-mono flex flex-col gap-1" style={{ color: 'var(--c-muted)' }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
