import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Send } from 'lucide-react';

export default function NotificationsPanel() {
  const [settings, setSettings] = useState({ llmMode: 'ollama', llmHost: '', llmModel: '', discordWebhook: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api('/api/settings').then((s) => {
      setSettings({
        llmMode: s.llmMode || 'ollama',
        llmHost: s.llmHost || '',
        llmModel: s.llmModel || '',
        discordWebhook: s.discordWebhook || ''
      });
      setLoaded(true);
    }).catch((e) => setMessage(`Error loading settings: ${e.message}`));
  }, []);

  function set(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      await api('/api/settings', { method: 'PUT', body: settings });
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function run(action) {
    setBusy(action);
    setMessage('');
    try {
      await api(`/api/notify/${action}`, { method: 'POST' });
      setMessage(action === 'digest' ? 'Digest sent to Discord' : 'Discord test sent');
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setBusy('');
    }
  }

  if (!loaded) {
    return (
      <div className="card padded">
        {message.startsWith('Error') ? message : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card padded">
        <h3>Local AI model</h3>
        <p className="muted small">
          Used only for resume tailoring and relevance scoring. Point it at a model server you run yourself.
        </p>
        <div className="form-grid">
          <label>Provider
            <select className="input" value={settings.llmMode} onChange={(e) => set('llmMode', e.target.value)}>
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio (OpenAI compatible)</option>
            </select>
          </label>
          <label>Host
            <input className="input" value={settings.llmHost} onChange={(e) => set('llmHost', e.target.value)} placeholder="http://192.168.1.152:11434" />
          </label>
          <label>Model
            <input className="input" value={settings.llmModel} onChange={(e) => set('llmModel', e.target.value)} placeholder="gemma4:latest" />
          </label>
        </div>
      </div>

      <div className="card padded">
        <h3>Discord notifications</h3>
        <p className="muted small">
          Create a Discord webhook on a channel (Settings → Integrations → Webhooks) and paste the URL here to receive daily digests.
        </p>
        <label>Webhook URL
          <input
            className="input"
            value={settings.discordWebhook}
            onChange={(e) => set('discordWebhook', e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
        </label>
        <div className="row gap mt">
          <button className="btn" disabled={busy !== ''} onClick={() => run('test')}>
            <Send size={15} /> {busy === 'test' ? 'Sending...' : 'Send test message'}
          </button>
          <button className="btn primary" disabled={busy !== ''} onClick={() => run('digest')}>
            {busy === 'digest' ? 'Sending...' : 'Send daily digest'}
          </button>
        </div>
      </div>

      <div className="card padded">
        <div className="row gap">
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save settings'}</button>
          {message && <span className={`notice ${message.startsWith('Error') ? 'error' : 'success'} small`}>{message}</span>}
        </div>
      </div>
    </div>
  );
}
