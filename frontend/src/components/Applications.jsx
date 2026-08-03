import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { PIPELINE_STATUSES } from '../constants.js';

export default function Applications() {
  const [apps, setApps] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      setApps(await api(`/api/applications${params}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function setStatus(id, status) {
    try {
      await api(`/api/applications/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function addManual() {
    const jobId = window.prompt('Job ID (find it in Search & Import)');
    if (!jobId) return;
    try {
      await api('/api/applications', { method: 'POST', body: { job_id: Number(jobId) } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="stack">
      <div className="card padded">
        <div className="row wrap gap">
          <h3 className="grow">Application reports</h3>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {PIPELINE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <a className="btn" href="/api/applications/export">Export CSV</a>
          <button className="btn" onClick={addManual}>Add manually</button>
        </div>
        {error && <div className="notice error small">{error}</div>}
      </div>

      <div className="card padded">
        {apps.length === 0 && <p className="muted">No applications recorded yet.</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Company</th>
                <th>Location</th>
                <th>Source</th>
                <th>Status</th>
                <th>Resume</th>
                <th>Applied</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td className="job-cell">{a.title}</td>
                  <td>{a.company}</td>
                  <td>{a.location || '-'}</td>
                  <td>{a.source}</td>
                  <td>
                    <select
                      className={`status-select status-${a.status.toLowerCase()}`}
                      value={a.status}
                      onChange={(e) => setStatus(a.id, e.target.value)}
                    >
                      {PIPELINE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>{a.resume_name || '-'}</td>
                  <td>{fmtDate(a.applied_at)}</td>
                  <td className="muted">{a.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
