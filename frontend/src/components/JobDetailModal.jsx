import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtDate } from '../api.js';
import { X } from 'lucide-react';

export default function JobDetailModal({ jobId, onClose, onAction }) {
  const [job, setJob] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/jobs/${jobId}`).then(setJob).catch((e) => setError(e.message));
    api('/api/resumes').then(setResumes).catch(() => {});
  }, [jobId]);

  if (!job) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {error ? `Failed to load job: ${error}` : 'Loading...'}
        </div>
      </div>
    );
  }

  const lastApp = job.applications && job.applications[0];

  async function saveToApply() {
    try {
      await api('/api/applications', {
        method: 'POST',
        body: { job_id: job.id, status: 'PENDING', portal: job.source }
      });
      onAction();
    } catch (e) {
      setError(e.message);
    }
  }

  async function markApplied() {
    try {
      let appId = lastApp && lastApp.id;
      if (!appId) {
        const created = await api('/api/applications', {
          method: 'POST',
          body: { job_id: job.id, status: 'APPLIED', portal: job.source }
        });
        appId = created.id;
      } else {
        await api(`/api/applications/${appId}`, {
          method: 'PATCH',
          body: { status: 'APPLIED' }
        });
      }
      onAction();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{job.title}</h3>
            <p className="muted">{job.company} · {job.location || 'Location unspecified'}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="chips">
            <span className={`pill ${job.work_mode ? 'mode-' + job.work_mode.toLowerCase() : ''}`}>{job.work_mode}</span>
            <span className="pill">{job.experience_level}</span>
            {job.salary_min && <span className="pill">{fmtMoney(job.salary_min)}{job.salary_max ? ` - ${fmtMoney(job.salary_max)}` : ''}</span>}
            <span className="pill">match {job.relevance_score}%</span>
            <span className="pill">{job.source}</span>
          </div>

          {lastApp && (
            <div className="notice">
              Application status: <strong>{lastApp.status}</strong>{' '}
              {lastApp.applied_at && <span className="muted">on {fmtDate(lastApp.applied_at)}</span>}
              {lastApp.resume_id && <span className="muted"> (resume #{lastApp.resume_id})</span>}
            </div>
          )}

          {job.url && (
            <p>
              <a href={job.url} target="_blank" rel="noreferrer" className="link">Open original posting</a>
            </p>
          )}

          <h4>Description</h4>
          <pre className="description">{job.description || 'No description available.'}</pre>
        </div>

        <div className="modal-footer">
          {resumes.length === 0 && <span className="muted">Tip: upload a resume first to tailor it for this job.</span>}
          {!lastApp && (
            <button className="btn" onClick={saveToApply}>Save to apply later</button>
          )}
          <button className="btn primary" onClick={markApplied}>
            {lastApp ? 'Mark as applied' : 'I applied for this'}
          </button>
        </div>
      </div>
    </div>
  );
}
