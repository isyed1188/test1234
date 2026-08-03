import { all, get, log } from './database.js';
import { fetchWithTimeout } from './http.js';

export async function sendDiscord(webhookUrl, content) {
  if (!webhookUrl) throw new Error('No Discord webhook URL configured');
  const res = await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    timeoutMs: 15000,
    label: 'Discord webhook',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: String(content).slice(0, 1900) })
  });
  if (!res.ok) throw new Error(`Discord webhook failed (${res.status}): ${await res.text()}`);
  return { ok: true };
}

function buildDigest() {
  const stats = get(
    `SELECT
       COUNT(*) AS total_jobs,
       SUM(CASE WHEN (SELECT COUNT(*) FROM applications a WHERE a.job_id = jobs.id) > 0 THEN 1 ELSE 0 END) AS applied_jobs
     FROM jobs`
  );
  const applied = all(
    `SELECT j.title, j.company, j.url, a.status, a.applied_at
     FROM applications a JOIN jobs j ON j.id = a.job_id
     WHERE a.status != 'PENDING'
     ORDER BY a.applied_at DESC LIMIT 15`
  );
  const pending = get(
    `SELECT COUNT(*) AS c FROM applications WHERE status = 'PENDING'`
  );
  const lines = [];
  lines.push('**JobHunt Coach daily digest**');
  lines.push('');
  lines.push(`Tracked jobs: ${stats?.total_jobs || 0}`);
  lines.push(`Applied: ${stats?.applied_jobs || 0}`);
  lines.push(`Pending follow-up: ${pending?.c || 0}`);
  if (applied.length) {
    lines.push('');
    lines.push('**Recent applications:**');
    for (const a of applied) {
      lines.push(`- ${a.title} @ ${a.company} — ${a.status}${a.url ? ` (${a.url})` : ''}`);
    }
  } else {
    lines.push('');
    lines.push('No applications recorded yet.');
  }
  return lines.join('\n');
}

export function buildDigestMessage() {
  return buildDigest();
}

export async function sendDailyDigest() {
  const webhookUrl = get('SELECT value FROM settings WHERE key = ?', ['discordWebhook']);
  if (!webhookUrl) throw new Error('No Discord webhook URL configured');
  let url;
  try {
    url = JSON.parse(webhookUrl.value);
  } catch (err) {
    log('error', `stored Discord webhook is not valid JSON: ${err.message}`);
    throw new Error('Stored Discord webhook setting is corrupt — re-save it in Settings');
  }
  try {
    const content = buildDigest();
    const result = await sendDiscord(url, content);
    log('info', 'daily digest sent to Discord');
    return result;
  } catch (err) {
    log('error', `digest send failed: ${err.message}`);
    throw err;
  }
}
