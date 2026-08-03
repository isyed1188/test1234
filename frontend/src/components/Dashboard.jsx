import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { PIPELINE_STATUSES } from '../constants.js';

function StatCard({ label, value, sub }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ onGo }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/stats').then(setStats).catch((e) => setError(e.message));
    api('/api/jobs?status=applied').then(setRecent).catch(() => {});
  }, []);

  if (!stats) {
    return <div className="card padded">{error ? `Failed to load stats: ${error}` : 'Loading...'}</div>;
  }

  const statusMap = Object.fromEntries(stats.byStatus.map((s) => [s.status, s.c]));

  return (
    <div className="stack">
      <div className="card padded">
        <h2>Welcome to your job hunt command center</h2>
        <p className="muted">
          Import roles from public Greenhouse & Lever job boards, track every application,
          tailor your resume with a local AI model, and export reports anytime.
        </p>
        <div className="row gap">
          <button className="btn primary" onClick={() => onGo('search')}>Find jobs</button>
          <button className="btn" onClick={() => onGo('resumes')}>Manage resumes</button>
          <button className="btn" onClick={() => onGo('profile')}>Set up profile</button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Tracked jobs" value={stats.totalJobs} />
        <StatCard label="Applications" value={stats.totalApplications} />
        <StatCard label="Applied" value={stats.appliedJobs} />
        <StatCard label="Avg relevance" value={`${stats.avgRelevance}%`} />
      </div>

      <div className="grid-2">
        <div className="card padded">
          <h3>Pipeline</h3>
          {stats.byStatus.length === 0 && <p className="muted">No applications yet.</p>}
          <div className="pipeline">
            {PIPELINE_STATUSES.map((s) => (
              <div key={s} className="pipeline-row">
                <span className="pipeline-label">{s}</span>
                <div className="pipeline-track">
                  <div
                    className={`pipeline-fill status-${s.toLowerCase()}`}
                    style={{ width: `${Math.min(100, (statusMap[s] || 0) * 20)}%` }}
                  />
                </div>
                <span className="pipeline-count">{statusMap[s] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card padded">
          <h3>Sources</h3>
          {stats.bySource.length === 0 && <p className="muted">Import jobs to populate sources.</p>}
          <div className="source-list">
            {stats.bySource.map((s) => (
              <div key={s.source} className="source-row">
                <span>{s.source}</span>
                <span className="pill">{s.c}</span>
              </div>
            ))}
          </div>
          <h3>Work mode</h3>
          <div className="source-list">
            {stats.byWorkMode.map((w) => (
              <div key={w.work_mode} className="source-row">
                <span>{w.work_mode || 'Unspecified'}</span>
                <span className="pill">{w.c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card padded">
        <h3>Recent applications</h3>
        {recent.length === 0 && <p className="muted">Nothing recorded yet.</p>}
        {recent.map((j) => (
          <div key={j.id} className="job-row">
            <div className="job-main">
              <span className="job-title">{j.title}</span>
              <span className="muted">@ {j.company}</span>
            </div>
            <span className={`pill status-${(j.application_status || '').toLowerCase()}`}>{j.application_status}</span>
            <span className="muted">{j.work_mode}</span>
            <span className="muted">{fmtDate(j.applied_at)}</span>
          </div>
        ))}
        <button className="btn ghost" onClick={() => onGo('applications')}>View all applications</button>
      </div>
    </div>
  );
}
