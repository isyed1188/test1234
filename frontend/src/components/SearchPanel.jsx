import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtDate } from '../api.js';
import JobDetailModal from './JobDetailModal.jsx';

const SALARY_BUCKETS = [
  { label: 'Any salary', value: '' },
  { label: '$100k+', value: '100000' },
  { label: '$150k+', value: '150000' },
  { label: '$200k+', value: '200000' }
];

export default function SearchPanel() {
  const [filters, setFilters] = useState({
    q: '', work_mode: '', experience_level: '', source: '', salary_bucket: '', min_relevance: '', status: ''
  });
  const [jobs, setJobs] = useState([]);
  const [sources, setSources] = useState({ greenhouse: [], lever: [], workday: [] });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [single, setSingle] = useState({ source: 'Greenhouse', company: '' });
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState('');
  const [lastImport, setLastImport] = useState(null);

  useEffect(() => {
    api('/api/sources').then(setSources).catch((e) => setError(`Could not load job board list: ${e.message}`));
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = await api(`/api/jobs?${params.toString()}`);
      setJobs(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function runImportAll() {
    setImporting(true);
    setError('');
    setLastImport(null);
    try {
      const result = await api('/api/import/all', { method: 'POST', body: { keyword } });
      setLastImport(result);
      await loadJobs();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  async function runImportSingle() {
    if (!single.company) return;
    setImporting(true);
    setError('');
    try {
      await api('/api/import', {
        method: 'POST',
        body: { source: single.source, company: single.company, keyword }
      });
      setSingle({ ...single, company: '' });
      await loadJobs();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  const ghCount = Object.values(lastImport?.greenhouse || {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
  const lvCount = Object.values(lastImport?.lever || {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
  const wdCount = Object.values(lastImport?.workday || {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);

  return (
    <div className="stack">
      <div className="card padded">
        <h3>Import jobs</h3>
        <div className="row wrap gap">
          <input
            className="input"
            placeholder="Keyword filter (e.g. DevOps, SRE)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button className="btn primary" disabled={importing} onClick={runImportAll}>
            {importing ? 'Importing...' : 'Import all boards'}
          </button>
        </div>
        <p className="muted small">
          Pulls live listings from {sources.greenhouse.length} Greenhouse boards, {sources.lever.length} Lever boards and {sources.workday.length} Fortune 500 (Workday) boards.
        </p>
        <div className="row wrap gap mt">
          <select className="input" value={single.source} onChange={(e) => setSingle({ ...single, source: e.target.value })}>
            <option>Greenhouse</option>
            <option>Lever</option>
            <option>Fortune 500</option>
          </select>
          <input
            className="input"
            placeholder="Company slug (gitlab, databricks, bankofamerica, intel)"
            value={single.company}
            onChange={(e) => setSingle({ ...single, company: e.target.value })}
          />
          <button className="btn" disabled={importing || !single.company} onClick={runImportSingle}>
            Import company
          </button>
        </div>
        {lastImport && (
          <div className="notice success small">
            Import finished — {ghCount} from Greenhouse, {lvCount} from Lever, {wdCount} from Fortune 500. Errors are logged per company.
          </div>
        )}
        {error && <div className="notice error small">{error}</div>}
      </div>

      <div className="card padded">
        <div className="row wrap gap">
          <input
            className="input grow"
            placeholder="Search title / company / skills"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
          <select className="input" value={filters.work_mode} onChange={(e) => setFilter('work_mode', e.target.value)}>
            <option value="">Any work mode</option>
            <option>Remote</option>
            <option>Hybrid</option>
            <option>Onsite</option>
          </select>
          <select className="input" value={filters.experience_level} onChange={(e) => setFilter('experience_level', e.target.value)}>
            <option value="">Any level</option>
            <option>Junior</option>
            <option>Senior</option>
            <option>Staff</option>
            <option>Principal</option>
            <option>Director</option>
            <option>Lead</option>
            <option>Not specified</option>
          </select>
          <select className="input" value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
            <option value="">Any source</option>
            <option>Greenhouse</option>
            <option>Lever</option>
            <option>Fortune 500</option>
          </select>
          <select className="input" value={filters.salary_bucket} onChange={(e) => setFilter('salary_bucket', e.target.value)}>
            {SALARY_BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          <input
            className="input"
            placeholder="Min match %"
            type="number"
            min="0"
            max="100"
            value={filters.min_relevance}
            onChange={(e) => setFilter('min_relevance', e.target.value)}
          />
          <select className="input" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All jobs</option>
            <option value="saved">Not yet applied</option>
            <option value="applied">Applied</option>
          </select>
          <button className="btn primary" onClick={loadJobs}>Apply filters</button>
        </div>
      </div>

      <div className="card padded">
        <h3>{loading ? 'Loading...' : `${jobs.length} jobs`}</h3>
        {jobs.length === 0 && !loading && <p className="muted">No jobs match. Try importing from the boards above.</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Company</th>
                <th>Mode</th>
                <th>Level</th>
                <th>Salary</th>
                <th>Match</th>
                <th>Source</th>
                <th>Status</th>
                <th>Fetched</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="clickable" onClick={() => setSelectedJob(j.id)}>
                  <td className="job-cell">{j.title}</td>
                  <td>{j.company}</td>
                  <td>{j.work_mode}</td>
                  <td>{j.experience_level}</td>
                  <td>{j.salary_max ? `${fmtMoney(j.salary_min)} - ${fmtMoney(j.salary_max)}` : (j.salary_min ? fmtMoney(j.salary_min) : '-')}</td>
                  <td><span className={`score score-${j.relevance_score >= 50 ? 'hi' : j.relevance_score >= 25 ? 'mid' : 'lo'}`}>{j.relevance_score}%</span></td>
                  <td>{j.source}</td>
                  <td>{j.application_status ? <span className={`pill status-${j.application_status.toLowerCase()}`}>{j.application_status}</span> : <span className="muted">new</span>}</td>
                  <td className="muted">{fmtDate(j.fetched_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedJob && (
        <JobDetailModal jobId={selectedJob} onClose={() => setSelectedJob(null)} onAction={loadJobs} />
      )}
    </div>
  );
}
