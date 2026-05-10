import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../../api/client';

interface DeviceStatusResponse {
  ip?: string;
  last_status?: {
    ip?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type HttpMethod = 'GET' | 'POST';

interface RequestLog {
  id: number;
  ts: string;
  method: HttpMethod;
  url: string;
  body: string;
  status: number | null;
  response: string;
  error: string | null;
  durationMs: number;
}

let logIdCounter = 0;

export default function DebugPage() {
  const { deviceId } = useParams<{ deviceId: string }>();

  const [deviceIp, setDeviceIp]   = useState<string>('');
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError,   setIpError]   = useState<string | null>(null);

  const [method,   setMethod]   = useState<HttpMethod>('GET');
  const [url,      setUrl]      = useState('');
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [logs,     setLogs]     = useState<RequestLog[]>([]);

  // Fetch device IP from server on mount
  useEffect(() => {
    if (!deviceId) return;
    setIpLoading(true);
    setIpError(null);
    apiGet<DeviceStatusResponse>(`/devices/${deviceId}/status`)
      .then((data) => {
        const ip = data?.last_status?.ip ?? (data?.ip as string | undefined) ?? '';
        setDeviceIp(ip);
        if (ip) {
          setUrl(`http://${ip}/status`);
        }
      })
      .catch((e: unknown) => {
        setIpError(e instanceof Error ? e.message : 'Failed to fetch device status');
      })
      .finally(() => setIpLoading(false));
  }, [deviceId]);

  const handleSend = async () => {
    if (!url.trim()) return;
    setSending(true);

    const start = Date.now();
    const entry: RequestLog = {
      id: ++logIdCounter,
      ts: new Date().toISOString(),
      method,
      url: url.trim(),
      body,
      status: null,
      response: '',
      error: null,
      durationMs: 0,
    };

    try {
      const init: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (method === 'POST' && body.trim()) {
        init.body = body.trim();
      }

      const res = await fetch(url.trim(), init);
      entry.status = res.status;
      entry.durationMs = Date.now() - start;

      const text = await res.text();
      try {
        entry.response = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        entry.response = text;
      }
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
      entry.durationMs = Date.now() - start;
    }

    setLogs((prev) => [entry, ...prev]);
    setSending(false);
  };

  const inputCls = `
    w-full font-mono text-sm px-3 py-2 rounded
    bg-[var(--c-bg)] border border-[var(--c-border)]
    text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]
  `.trim();

  return (
    <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-mono tracking-widest" style={{ color: 'var(--c-text)' }}>
          DEBUG <span style={{ color: 'var(--c-accent)' }}>{deviceId}</span>
        </h1>
      </div>

      {/* Warning banner */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm font-mono"
        style={{
          background: 'rgba(255, 160, 0, 0.08)',
          border: '1px solid var(--c-warn, #f59e0b)',
          color: 'var(--c-warn, #f59e0b)',
        }}
      >
        <span className="text-base leading-none mt-0.5">⚠</span>
        <div>
          <div className="font-bold tracking-wider mb-0.5">调试模式，绕过服务端</div>
          <div className="opacity-80 text-xs">
            此页面直接向 ESP32 设备发送 HTTP 请求，不经过 esp-server 中转。
            请确认设备 IP 可达，且操作不会影响生产环境。
          </div>
        </div>
      </div>

      {/* Device IP info */}
      <div
        className="rounded-xl p-4 flex flex-col gap-2"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <div className="text-xs font-mono tracking-widest mb-1" style={{ color: 'var(--c-muted)' }}>
          DEVICE INFO
        </div>
        {ipLoading && (
          <div className="text-xs font-mono" style={{ color: 'var(--c-hint)' }}>
            正在获取设备 IP…
          </div>
        )}
        {ipError && (
          <div className="text-xs font-mono" style={{ color: 'var(--c-rev)' }}>
            ✕ {ipError}
          </div>
        )}
        {!ipLoading && !ipError && (
          <div className="flex items-center gap-3 text-sm font-mono">
            <span style={{ color: 'var(--c-hint)' }}>IP</span>
            <span style={{ color: deviceIp ? 'var(--c-ok)' : 'var(--c-muted)' }}>
              {deviceIp || '未知'}
            </span>
            {deviceIp && (
              <a
                href={`http://${deviceIp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: 'var(--c-accent)' }}
              >
                打开设备页面 ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* Request builder */}
      <div
        className="rounded-xl p-5 flex flex-col gap-4"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <div className="text-xs font-mono tracking-widest" style={{ color: 'var(--c-muted)' }}>
          REQUEST BUILDER
        </div>

        {/* Method + URL */}
        <div className="flex gap-3">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className="font-mono text-sm px-3 py-2 rounded cursor-pointer"
            style={{
              background: 'var(--c-bg)',
              border: '1px solid var(--c-border)',
              color: method === 'POST' ? 'var(--c-accent)' : 'var(--c-ok)',
              minWidth: 80,
            }}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={deviceIp ? `http://${deviceIp}/status` : 'http://192.168.x.x/...'}
            className={inputCls + ' flex-1'}
          />
        </div>

        {/* Body (POST only) */}
        {method === 'POST' && (
          <div>
            <label className="text-xs font-mono mb-1 block" style={{ color: 'var(--c-muted)' }}>
              Request Body (JSON)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder='{"cmd": "run", "speed": 512, "direction": "forward"}'
              className={inputCls}
              style={{ resize: 'vertical', fontFamily: 'var(--font-mono)' }}
            />
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || !url.trim()}
          className="py-2.5 rounded-lg text-sm font-mono tracking-wider cursor-pointer transition-all disabled:opacity-50"
          style={{
            background: 'var(--c-accent-dim)',
            color: 'var(--c-accent)',
            border: '1px solid var(--c-accent)',
          }}
        >
          {sending ? '发送中…' : `▶ SEND ${method}`}
        </button>
      </div>

      {/* Response log */}
      {logs.length > 0 && (
        <div
          className="rounded-xl p-5 flex flex-col gap-4"
          style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono tracking-widest" style={{ color: 'var(--c-muted)' }}>
              RESPONSE LOG
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-xs font-mono cursor-pointer"
              style={{ color: 'var(--c-hint)' }}
            >
              清空
            </button>
          </div>

          <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg p-3 text-xs font-mono"
                style={{
                  background: 'var(--c-bg)',
                  border: `1px solid ${log.error ? 'var(--c-rev)' : log.status && log.status < 300 ? 'var(--c-ok)' : 'var(--c-warn, #f59e0b)'}`,
                }}
              >
                {/* Request line */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    style={{ color: log.method === 'POST' ? 'var(--c-accent)' : 'var(--c-ok)' }}
                  >
                    {log.method}
                  </span>
                  <span style={{ color: 'var(--c-text)' }} className="break-all">{log.url}</span>
                  <span className="ml-auto" style={{ color: 'var(--c-hint)' }}>
                    {log.durationMs}ms
                  </span>
                </div>

                {/* Status */}
                {log.status !== null && (
                  <div className="mb-2">
                    <span style={{ color: 'var(--c-hint)' }}>STATUS </span>
                    <span
                      style={{
                        color: log.status < 300 ? 'var(--c-ok)' : 'var(--c-rev)',
                        fontWeight: 700,
                      }}
                    >
                      {log.status}
                    </span>
                  </div>
                )}

                {/* Error */}
                {log.error && (
                  <div style={{ color: 'var(--c-rev)' }}>✕ {log.error}</div>
                )}

                {/* Response body */}
                {log.response && (
                  <pre
                    className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap break-all"
                    style={{ color: 'var(--c-muted)', maxHeight: 200 }}
                  >
                    {log.response}
                  </pre>
                )}

                <div className="mt-2" style={{ color: 'var(--c-hint)' }}>
                  {log.ts}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
