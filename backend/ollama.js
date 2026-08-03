import { getSetting } from './database.js';
import { assertHttpUrl } from './validate.js';
import { fetchWithTimeout } from './http.js';

export function getLlamaConfig() {
  const mode = getSetting('llmMode', 'ollama');
  if (mode === 'lmstudio') {
    return {
      mode,
      host: getSetting('llmHost', 'http://localhost:1234/v1'),
      model: getSetting('llmModel', 'local-model')
    };
  }
  return {
    mode: 'ollama',
    host: getSetting('llmHost', process.env.OLLAMA_HOST || 'http://localhost:11434'),
    model: getSetting('llmModel', process.env.LLM_MODEL || 'llama3.1:latest')
  };
}

export async function generate(prompt, timeoutMs = 90000) {
  const cfg = getLlamaConfig();
  if (!cfg.host) throw new Error('No LLM host configured (set it in Notifications & Settings)');
  assertHttpUrl(cfg.host, 'LLM host');
  const host = cfg.host.replace(/\/$/, '');
  const isLmStudio = cfg.mode === 'lmstudio';
  const url = isLmStudio ? `${host}/chat/completions` : `${host}/api/generate`;
  const body = isLmStudio
    ? { model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0.4, stream: false }
    : { model: cfg.model, prompt, stream: false, options: { temperature: 0.4 } };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    timeoutMs,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const text = isLmStudio ? data?.choices?.[0]?.message?.content : data?.response;
  return (text || '').trim();
}

export async function checkHealth() {
  const cfg = getLlamaConfig();
  if (!cfg.host) return { ok: false, status: 0, config: cfg, error: 'No LLM host configured' };
  const host = cfg.host.replace(/\/$/, '');
  const url = cfg.mode === 'lmstudio' ? `${host}/models` : `${host}/api/tags`;
  try {
    assertHttpUrl(cfg.host, 'LLM host');
    const res = await fetchWithTimeout(url, { timeoutMs: 5000 });
    return { ok: res.ok, status: res.status, config: cfg };
  } catch (err) {
    return { ok: false, status: 0, config: cfg, error: err.message };
  }
}

export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
