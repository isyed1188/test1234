import { all, get, getSetting, log } from './database.js';
import { describeFetchError, responseError } from './httpClient.js';

export async function sendDiscord(webhookUrl, content) {
  if (!webhookUrl) throw new Error('No Discord webhook URL configured');
  const timeoutMs = 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(content).slice(0, 1900) })
    });
    if (!res.ok) throw await responseError(res, 'Discord webhook');
    return { ok: true };
  } catch (err) {
    throw describeFetchError(err, 'Discord webhook', timeoutMs);
  } finally {
    clearTimeout(timer);
  }
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
  const url = getSetting('discordWebhook', '');
  if (!url) throw new Error('No Discord webhook URL configured');
  try {
    const result = await sendDiscord(url, buildDigest());
    log('info', 'daily digest sent to Discord');
    return result;
  } catch (err) {
    log('error', `digest send failed: ${err.message}`);
    throw err;
  }
}
