import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Header({ tabs, active, onSelect }) {
  const [llm, setLlm] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/api/health')
      .then((h) => alive && setLlm(h.llm))
      .catch(() => alive && setLlm(null));
    return () => { alive = false; };
  }, []);

  return (
    <header className="header">
      <div className="header-brand">
        <span className="logo-dot" />
        <span className="brand-name">JobHunt Coach</span>
        <span className="brand-sub">tracker · import · tailor · report</span>
      </div>
      <nav className="nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`nav-item ${active === t.id ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className={`llm-badge ${llm && llm.ok ? 'online' : 'offline'}`}>
        <span className="llm-dot" />
        {llm && llm.ok ? `${llm.config.mode} · ${llm.config.model}` : 'local AI offline'}
      </div>
    </header>
  );
}
