import { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY = {
  name: '', email: '', phone: '', location: '', headline: '',
  skills: [], url: '', salary_target: '', cover_letter: ''
};

export default function ProfileManager() {
  const [profile, setProfile] = useState(EMPTY);
  const [skillsText, setSkillsText] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/profile').then((p) => {
      const merged = { ...EMPTY, ...p };
      setProfile(merged);
      setSkillsText((merged.skills || []).join(', '));
    }).catch((e) => setError(`Could not load your profile: ${e.message}`));
  }, []);

  function set(key, value) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setError('');
    const payload = {
      ...profile,
      skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean)
    };
    try {
      await api('/api/profile', { method: 'PUT', body: payload });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="stack">
      <div className="card padded">
        <h3>Candidate profile</h3>
        <p className="muted small">
          Skills are used to compute a relevance score for every imported job. The cover letter template and salary target are saved for your own use when you apply.
        </p>
        <div className="form-grid">
          <label>Full name
            <input className="input" value={profile.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label>Headline
            <input className="input" value={profile.headline} onChange={(e) => set('headline', e.target.value)} placeholder="e.g. Senior DevOps Engineer" />
          </label>
          <label>Email
            <input className="input" value={profile.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label>Phone
            <input className="input" value={profile.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label>Location
            <input className="input" value={profile.location} onChange={(e) => set('location', e.target.value)} />
          </label>
          <label>LinkedIn / portfolio URL
            <input className="input" value={profile.url} onChange={(e) => set('url', e.target.value)} />
          </label>
          <label>Salary target
            <input className="input" value={profile.salary_target} onChange={(e) => set('salary_target', e.target.value)} placeholder="e.g. $200,000" />
          </label>
          <label className="span-2">Skills (comma separated)
            <input className="input" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="Kubernetes, Terraform, AWS, Python" />
          </label>
          <label className="span-2">Cover letter template
            <textarea
              className="input"
              rows="5"
              value={profile.cover_letter}
              onChange={(e) => set('cover_letter', e.target.value)}
            />
          </label>
        </div>
        <div className="row gap mt">
          <button className="btn primary" onClick={save}>Save profile</button>
          {saved && <span className="notice success small">Saved</span>}
          {error && <span className="notice error small">{error}</span>}
        </div>
      </div>
    </div>
  );
}
