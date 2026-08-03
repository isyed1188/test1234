import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const settings = new Map();

vi.mock('../backend/database.js', () => ({
  getSetting: (key, fallback = null) => (settings.has(key) ? settings.get(key) : fallback)
}));

const { getLlamaConfig, generate, checkHealth, extractJson } = await import('../backend/ollama.js');

beforeEach(() => {
  settings.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('getLlamaConfig', () => {
  it('defaults to ollama', () => {
    expect(getLlamaConfig()).toEqual({
      mode: 'ollama',
      host: 'http://localhost:11434',
      model: 'llama3.1:latest'
    });
  });

  it('returns lmstudio defaults when that mode is selected', () => {
    settings.set('llmMode', 'lmstudio');
    expect(getLlamaConfig()).toEqual({
      mode: 'lmstudio',
      host: 'http://localhost:1234/v1',
      model: 'local-model'
    });
  });

  it('honors stored host and model overrides', () => {
    settings.set('llmHost', 'http://example.test:1234/');
    settings.set('llmModel', 'my-model');
    expect(getLlamaConfig()).toMatchObject({ host: 'http://example.test:1234/', model: 'my-model' });
  });

  it('treats an unknown mode as ollama', () => {
    settings.set('llmMode', 'something-else');
    expect(getLlamaConfig().mode).toBe('ollama');
  });
});

describe('generate', () => {
  it('calls the ollama generate endpoint and trims the response', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({ response: '  hi  ' }) }));
    settings.set('llmHost', 'http://host.test/');
    await expect(generate('prompt')).resolves.toBe('hi');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://host.test/api/generate');
    expect(JSON.parse(opts.body)).toMatchObject({ prompt: 'prompt', stream: false });
  });

  it('calls the lmstudio chat endpoint and reads the message content', async () => {
    settings.set('llmMode', 'lmstudio');
    const fetchMock = stubFetch(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'answer' } }] })
    }));
    await expect(generate('prompt')).resolves.toBe('answer');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions');
  });

  it('returns an empty string when the payload has no text', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({}) }));
    await expect(generate('prompt')).resolves.toBe('');
  });

  it('throws with status and body when the request fails', async () => {
    stubFetch(async () => ({ ok: false, status: 503, text: async () => 'unavailable' }));
    await expect(generate('prompt')).rejects.toThrow('LLM request failed (503): unavailable');
  });
});

describe('checkHealth', () => {
  it('probes the ollama tags endpoint', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200 }));
    const health = await checkHealth();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
    expect(health).toMatchObject({ ok: true, status: 200 });
    expect(health.config.mode).toBe('ollama');
  });

  it('probes the lmstudio models endpoint', async () => {
    settings.set('llmMode', 'lmstudio');
    const fetchMock = stubFetch(async () => ({ ok: false, status: 404 }));
    const health = await checkHealth();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:1234/v1/models');
    expect(health).toMatchObject({ ok: false, status: 404 });
  });

  it('reports the error instead of throwing when the host is unreachable', async () => {
    stubFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(checkHealth()).resolves.toMatchObject({ ok: false, status: 0, error: 'ECONNREFUSED' });
  });
});

describe('extractJson', () => {
  it('returns null for empty input', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson(null)).toBeNull();
  });

  it('parses a bare json object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses json wrapped in prose', () => {
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  it('parses json inside a fenced code block', () => {
    expect(extractJson('```json\n{"summary":"s","skills":"js"}\n```')).toEqual({ summary: 's', skills: 'js' });
  });

  it('returns null when no braces are present', () => {
    expect(extractJson('no json here')).toBeNull();
  });

  it('returns null for malformed json', () => {
    expect(extractJson('{"a": }')).toBeNull();
  });
});
