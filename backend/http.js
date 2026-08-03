const DEFAULT_USER_AGENT = 'JobHuntCoach/1.0';

// fetch reports every connection problem as "fetch failed" and every abort as
// "This operation was aborted", which says nothing about what was being called.
export function describeFetchError(err, label, timeoutMs) {
  if (err.name === 'AbortError') {
    return new Error(`request to ${label} timed out after ${timeoutMs}ms`);
  }
  if (err.name === 'SyntaxError') {
    return new Error(`invalid JSON in response from ${label}: ${err.message}`);
  }
  if (err.name === 'TypeError') {
    const cause = err.cause?.code || err.cause?.message;
    return new Error(`could not reach ${label}${cause ? ` (${cause})` : ''}`);
  }
  return err;
}

export async function responseError(res, label) {
  const body = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
  const detail = body
    ? `: ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`
    : '';
  return new Error(`HTTP ${res.status} from ${label}${detail}`);
}

// `label` names the endpoint in error messages; pass one when the URL itself is
// a secret (e.g. a Discord webhook) so it stays out of logs.
export async function fetchWithTimeout(url, { timeoutMs = 20000, label = url, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    throw describeFetchError(err, label, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res, label, timeoutMs) {
  if (!res.ok) throw await responseError(res, label);
  try {
    return await res.json();
  } catch (err) {
    throw describeFetchError(err, label, timeoutMs);
  }
}

export async function fetchJson(url, timeoutMs = 20000) {
  const res = await fetchWithTimeout(url, {
    timeoutMs,
    headers: { 'User-Agent': DEFAULT_USER_AGENT }
  });
  return readJson(res, url, timeoutMs);
}

export async function postJson(url, body, timeoutMs = 60000) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    timeoutMs,
    headers: { 'Content-Type': 'application/json', 'User-Agent': DEFAULT_USER_AGENT },
    body: JSON.stringify(body)
  });
  return readJson(res, url, timeoutMs);
}
