import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, fmtMoney, fmtDate } from '../frontend/src/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api', () => {
  it('serializes non-string bodies and returns parsed json', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({ hello: 'world' }) }));
    const result = await api('/api/jobs', { method: 'POST', body: { a: 1 } });
    expect(result).toEqual({ hello: 'world' });
    const [path, opts] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/jobs');
    expect(opts.body).toBe('{"a":1}');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('leaves string bodies untouched', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({}) }));
    await api('/api/jobs', { body: 'raw' });
    expect(fetchMock.mock.calls[0][1].body).toBe('raw');
  });

  it('throws the server-provided error message', async () => {
    stubFetch(async () => ({ ok: false, status: 400, json: async () => ({ error: 'bad input' }) }));
    await expect(api('/api/jobs')).rejects.toThrow('bad input');
  });

  it('falls back to a status message when the error body is not json', async () => {
    stubFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      }
    }));
    await expect(api('/api/jobs')).rejects.toThrow('Request failed (500)');
  });
});

describe('fmtMoney', () => {
  it('renders a dash for null and undefined', () => {
    expect(fmtMoney(null)).toBe('-');
    expect(fmtMoney(undefined)).toBe('-');
  });

  it('formats numbers as whole dollars', () => {
    expect(fmtMoney(0)).toBe('$0');
    expect(fmtMoney(120000)).toBe('$120,000');
    expect(fmtMoney(1500.6)).toBe('$1,501');
  });
});

describe('fmtDate', () => {
  it('renders a dash for empty and invalid values', () => {
    expect(fmtDate(null)).toBe('-');
    expect(fmtDate('')).toBe('-');
    expect(fmtDate('not-a-date')).toBe('-');
  });

  it('formats valid dates using the locale string', () => {
    const iso = '2024-05-01T12:00:00.000Z';
    expect(fmtDate(iso)).toBe(new Date(iso).toLocaleString());
  });
});
