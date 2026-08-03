const DISCORD_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com'
]);

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function parseHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url;
}

export function assertHttpUrl(value, label) {
  const url = parseHttpUrl(value);
  if (!url) throw new Error(`${label} must be a valid http(s) URL`);
  return url;
}

export function assertDiscordWebhook(value) {
  const url = assertHttpUrl(value, 'Discord webhook');
  if (url.protocol !== 'https:' || !DISCORD_WEBHOOK_HOSTS.has(url.hostname)) {
    throw new Error('Discord webhook must be an https://discord.com/api/webhooks/... URL');
  }
  if (!url.pathname.startsWith('/api/webhooks/')) {
    throw new Error('Discord webhook must be an https://discord.com/api/webhooks/... URL');
  }
  return url.toString();
}

export function assertSlug(value, label) {
  const slug = String(value || '');
  if (!SLUG_RE.test(slug)) throw new Error(`Invalid ${label}: ${slug.slice(0, 50)}`);
  return slug;
}

export function clampText(value, max) {
  return String(value ?? '').slice(0, max);
}
