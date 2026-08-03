import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Upload, Wand2 } from 'lucide-react';

export default function ResumeManager() {
  const [resumes, setResumes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [tailoring, setTailoring] = useState(null);
  const [tailorJob, setTailorJob] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);

  async function load() {
    try {
      const [nextResumes, nextJobs] = await Promise.all([
        api('/api/resumes'),
        api('/api/jobs?status=saved&limit=100')
      ]);
      setResumes(nextResumes);
      setJobs(nextJobs);
    } catch (e) {
      setError(`Could not load resumes and jobs: ${e.message}`);
    }
  }

  useEffect(() => { load(); }, []);

  async function uploadFile(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    setError('');
    try {
      const res = await fetch('/api/resumes/upload', { method: 'POST', body: fd });
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Upload failed (${res.status}): ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(body?.error || `Upload failed (${res.status})`);
      setNotice(`Uploaded ${body.original_name} (${body.content.length} chars parsed)`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function setBaseline(id) {
    setError('');
    try {
      await api(`/api/resumes/${id}/baseline`, { method: 'POST' });
      load();
    } catch (e) {
      setError(`Could not set baseline: ${e.message}`);
    }
  }

  async function tailor(id) {
    if (!tailorJob) return setError('Pick a job to tailor for first');
    setTailoring(id);
    setError('');
    setNotice('');
    try {
      const result = await api(`/api/resumes/${id}/tailor`, { method: 'POST', body: { job_id: Number(tailorJob) } });
      setNotice(`Created tailored resume "${result.name}"`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setTailoring(null);
    }
  }

  return (
    <div className="stack">
      <div className="card padded">
        <h3>Upload a resume</h3>
        <p className="muted small">Supported: PDF, DOCX, DOC, TXT, MD. Plain text or Markdown parses best for AI tailoring.</p>
        <div className="row gap mt">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md"
            onChange={(e) => uploadFile(e.target.files[0])}
          />
          <span className="muted">{uploading ? 'Parsing...' : ''}</span>
        </div>
        {notice && <div className="notice success small">{notice}</div>}
        {error && <div className="notice error small">{error}</div>}
      </div>

      <div className="card padded">
        <h3>Resumes</h3>
        {resumes.length === 0 && <p className="muted">No resumes yet. Upload one above.</p>}
        <div className="resume-list">
          {resumes.map((r) => (
            <div key={r.id} className={`resume-card ${r.is_baseline ? 'baseline' : ''}`}>
              <div className="resume-info">
                <span className="job-title">{r.name}</span>
                <span className="muted small">
                  {r.format.toUpperCase()} · {r.content.length} chars
                  {r.tailored_for_job_id ? ` · tailored for job #${r.tailored_for_job_id}` : ''}
                  {r.is_baseline ? ' · baseline' : ''}
                </span>
              </div>
              <div className="row gap">
                {!r.is_baseline && (
                  <button className="btn ghost" onClick={() => setBaseline(r.id)}>Set baseline</button>
                )}
                <select className="input" value={tailorJob} onChange={(e) => setTailorJob(e.target.value)}>
                  <option value="">Tailor for job...</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} @ {j.company}</option>)}
                </select>
                <button className="btn primary" disabled={tailoring === r.id} onClick={() => tailor(r.id)}>
                  <Wand2 size={16} /> {tailoring === r.id ? 'Tailoring...' : 'Tailor'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small mt">
          Tailoring runs on your local model (Ollama or LM Studio). It only reorders and rewords existing facts in your resume — it never invents experience.
        </p>
      </div>
    </div>
  );
}
