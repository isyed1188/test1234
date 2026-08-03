import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';

export default function LogsViewer() {
  const [logs, setLogs] = useState([]);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let timer;
    const tick = async () => {
      try {
        setLogs(await api('/api/logs?limit=300'));
        setError('');
      } catch (e) {
        setError(`Could not fetch logs: ${e.message}`);
      }
      if (auto) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [auto]);

  return (
    <div className="card padded">
      <div className="row gap">
        <h3 className="grow">Backend logs</h3>
        <label className="row gap">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          auto-refresh
        </label>
      </div>
      {error && <div className="notice error small">{error}</div>}
      <pre className="log-view">
        {logs.length === 0 ? 'No logs yet.' : logs.map((l) => (
          <div key={l.id} className={`log-line log-${l.level}`}>
            <span className="muted">[{fmtDate(l.ts)}]</span> <span className="log-level">{l.level}</span> {l.message}
          </div>
        ))}
      </pre>
    </div>
  );
}
