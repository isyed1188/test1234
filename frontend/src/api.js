export async function api(path, options = {}) {
  const opts = { ...options };
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
  } catch (err) {
    throw new Error(`Cannot reach the server (${err.message}). Is it still running?`);
  }
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // A non-JSON body means a proxy or crash page, not our API.
      if (res.ok) throw new Error(`Unexpected non-JSON response from ${path}`);
      throw new Error(`Request failed (${res.status}): ${text.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status} ${res.statusText})`);
  }
  return body;
}

export function fmtMoney(value) {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}
