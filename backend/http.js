const DEFAULT_USER_AGENT = 'JobHuntCoach/1.0';

export async function fetchWithTimeout(url, { timeoutMs = 20000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, timeoutMs = 20000) {
  const res = await fetchWithTimeout(url, {
    timeoutMs,
    headers: { 'User-Agent': DEFAULT_USER_AGENT }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function postJson(url, body, timeoutMs = 60000) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    timeoutMs,
    headers: { 'Content-Type': 'application/json', 'User-Agent': DEFAULT_USER_AGENT },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
