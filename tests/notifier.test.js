import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  stats: { total_jobs: 0, applied_jobs: 0 },
  applied: [],
  pending: { c: 0 },
  webhook: null
};

const logCalls = [];

vi.mock('../backend/database.js', () => ({
  get: (sql, params = []) => {
    if (sql.includes('FROM settings')) return state.webhook;
    if (sql.includes('total_jobs')) return state.stats;
    if (sql.includes("status = 'PENDING'")) return state.pending;
    return undefined;
  },
  all: () => state.applied,
  getSetting: (key, fallback = null) => {
    if (key === 'discordWebhook') return state.webhook ? JSON.parse(state.webhook.value) : fallback;
    return fallback;
  },
  log: (level, message) => logCalls.push([level, message])
}));

const { sendDiscord, buildDigestMessage, sendDailyDigest } = await import('../backend/notifier.js');

beforeEach(() => {
  state.stats = { total_jobs: 0, applied_jobs: 0 };
  state.applied = [];
  state.pending = { c: 0 };
  state.webhook = null;
  logCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const WEBHOOK = 'https://discord.com/api/webhooks/123/abcdef';

describe('sendDiscord', () => {
  it('rejects when no webhook url is given', async () => {
    await expect(sendDiscord('', 'hi')).rejects.toThrow('No Discord webhook URL configured');
  });

  it('rejects a webhook url that is not a discord webhook', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true }));
    await expect(sendDiscord('https://evil.test/hook', 'hi')).rejects.toThrow(
      'Discord webhook must be an https://discord.com/api/webhooks/... URL'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the content as json', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true }));
    await expect(sendDiscord(WEBHOOK, 'hello')).resolves.toEqual({ ok: true });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ content: 'hello' });
  });

  it('truncates long content to the discord limit', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true }));
    await sendDiscord(WEBHOOK, 'x'.repeat(5000));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toHaveLength(1900);
  });

  it('throws with the status on failure without leaking the response body', async () => {
    stubFetch(async () => ({ ok: false, status: 429, text: async () => 'rate limited' }));
    await expect(sendDiscord(WEBHOOK, 'hi')).rejects.toThrow('Discord webhook failed (429)');
    await expect(sendDiscord(WEBHOOK, 'hi')).rejects.not.toThrow('rate limited');
  });
});

describe('buildDigestMessage', () => {
  it('reports zero counts and no applications', () => {
    const msg = buildDigestMessage();
    expect(msg).toContain('Tracked jobs: 0');
    expect(msg).toContain('Applied: 0');
    expect(msg).toContain('Pending follow-up: 0');
    expect(msg).toContain('No applications recorded yet.');
  });

  it('lists recent applications with status and url', () => {
    state.stats = { total_jobs: 12, applied_jobs: 3 };
    state.pending = { c: 2 };
    state.applied = [
      { title: 'Engineer', company: 'Acme', url: 'https://jobs.test/1', status: 'APPLIED' },
      { title: 'Dev', company: 'Globex', url: null, status: 'INTERVIEW' }
    ];
    const msg = buildDigestMessage();
    expect(msg).toContain('Tracked jobs: 12');
    expect(msg).toContain('- Engineer @ Acme — APPLIED (https://jobs.test/1)');
    expect(msg).toContain('- Dev @ Globex — INTERVIEW');
    expect(msg).not.toContain('No applications recorded yet.');
  });
});

describe('sendDailyDigest', () => {
  it('throws when no webhook is stored', async () => {
    await expect(sendDailyDigest()).rejects.toThrow('No Discord webhook URL configured');
  });

  it('sends the digest and logs success', async () => {
    state.webhook = { value: JSON.stringify(WEBHOOK) };
    const fetchMock = stubFetch(async () => ({ ok: true }));
    await expect(sendDailyDigest()).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe(WEBHOOK);
    expect(logCalls).toContainEqual(['info', 'daily digest sent to Discord']);
  });

  it('logs and rethrows when the webhook call fails', async () => {
    state.webhook = { value: JSON.stringify(WEBHOOK) };
    stubFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    await expect(sendDailyDigest()).rejects.toThrow('Discord webhook failed (500)');
    expect(logCalls.some(([level]) => level === 'error')).toBe(true);
  });
});
