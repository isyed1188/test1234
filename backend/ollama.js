import { getSetting } from './database.js';
import { assertHttpUrl } from './validate.js';

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
    host: getSetting('llmHost', 'http://192.168.1.152:11434'),
    model: getSetting('llmModel', 'gemma4:latest')
  };
}

export async function generate(prompt, timeoutMs = 90000) {
  const cfg = getLlamaConfig();
  assertHttpUrl(cfg.host, 'LLM host');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    if (cfg.mode === 'lmstudio') {
      res = await fetch(`${cfg.host.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          stream: false
        })
      });
    } else {
      res = await fetch(`${cfg.host.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          prompt,
          stream: false,
          options: { temperature: 0.4 }
        })
      });
    }
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const text = cfg.mode === 'lmstudio' ? data?.choices?.[0]?.message?.content : data?.response;
    return (text || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth() {
  const cfg = getLlamaConfig();
  try {
    assertHttpUrl(cfg.host, 'LLM host');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const url = cfg.mode === 'lmstudio'
      ? `${cfg.host.replace(/\/$/, '')}/models`
      : `${cfg.host.replace(/\/$/, '')}/api/tags`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
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
