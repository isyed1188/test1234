import { getSetting } from './database.js';
import { describeFetchError, responseError } from './httpClient.js';

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
  if (!cfg.host) throw new Error('No LLM host configured (set it in Notifications & Settings)');
  const url = cfg.mode === 'lmstudio'
    ? `${cfg.host.replace(/\/$/, '')}/chat/completions`
    : `${cfg.host.replace(/\/$/, '')}/api/generate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    if (cfg.mode === 'lmstudio') {
      res = await fetch(url, {
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
      res = await fetch(url, {
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
    if (!res.ok) throw await responseError(res, url);
    const data = await res.json();
    const text = cfg.mode === 'lmstudio' ? data?.choices?.[0]?.message?.content : data?.response;
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new Error(`LLM ${cfg.model} at ${cfg.host} returned an empty response`);
    }
    return trimmed;
  } catch (err) {
    throw describeFetchError(err, url, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth() {
  const cfg = getLlamaConfig();
  if (!cfg.host) return { ok: false, status: 0, config: cfg, error: 'No LLM host configured' };
  const timeoutMs = 5000;
  const url = cfg.mode === 'lmstudio'
    ? `${cfg.host.replace(/\/$/, '')}/models`
    : `${cfg.host.replace(/\/$/, '')}/api/tags`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { ok: res.ok, status: res.status, config: cfg };
  } catch (err) {
    return { ok: false, status: 0, config: cfg, error: describeFetchError(err, url, timeoutMs).message };
  } finally {
    clearTimeout(timer);
  }
}

// Returns the parsed object, or an Error explaining why the text was unusable,
// so callers can report the actual reason instead of a bare "could not parse".
export function extractJson(text) {
  if (!text) return new Error('empty response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return new Error(`response contained no JSON object: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    return new Error(`response was not valid JSON (${err.message}): ${text.slice(0, 200)}`);
  }
}
