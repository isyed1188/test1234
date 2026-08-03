import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const generate = vi.fn();

vi.mock('../backend/database.js', () => ({ getSetting: (_key, fallback = null) => fallback }));

vi.mock('../backend/ollama.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generate };
});

const { formatOf, isSupported, extractText, tailorResume, applyTailoring } = await import('../backend/resumeEngine.js');

beforeEach(() => {
  generate.mockReset();
});

async function tmpFile(name, content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-'));
  const file = path.join(dir, name);
  await fs.writeFile(file, content);
  return file;
}

describe('formatOf / isSupported', () => {
  it('maps known extensions case-insensitively', () => {
    expect(formatOf('a.pdf')).toBe('pdf');
    expect(formatOf('a.PDF')).toBe('pdf');
    expect(formatOf('a.docx')).toBe('docx');
    expect(formatOf('a.doc')).toBe('doc');
    expect(formatOf('a.txt')).toBe('txt');
    expect(formatOf('a.md')).toBe('md');
  });

  it('returns unknown for other extensions and extension-less names', () => {
    expect(formatOf('a.rtf')).toBe('unknown');
    expect(formatOf('resume')).toBe('unknown');
  });

  it('supports exactly the known formats', () => {
    expect(isSupported('a.md')).toBe(true);
    expect(isSupported('a.rtf')).toBe(false);
  });
});

describe('extractText', () => {
  it('reads and trims plain text and markdown files', async () => {
    const file = await tmpFile('r.txt', '  hello resume  ');
    await expect(extractText(file, 'r.txt')).resolves.toBe('hello resume');
    const md = await tmpFile('r.md', '\n# Title\n');
    await expect(extractText(md, 'r.md')).resolves.toBe('# Title');
  });

  it('falls back to best-effort text for legacy .doc binaries', async () => {
    const file = await tmpFile('r.doc', Buffer.from('\u0000\u0001Experienced engineer\u0000'));
    await expect(extractText(file, 'r.doc')).resolves.toContain('Experienced engineer');
  });

  it('returns an empty string when the .doc has no readable runs', async () => {
    const file = await tmpFile('r.doc', Buffer.from([0, 1, 2, 3]));
    await expect(extractText(file, 'r.doc')).resolves.toBe('');
  });

  it('returns an empty string for unsupported formats', async () => {
    const file = await tmpFile('r.rtf', 'ignored');
    await expect(extractText(file, 'r.rtf')).resolves.toBe('');
  });

  it('extracts text from a docx file', async () => {
    const file = await tmpFile('r.docx', Buffer.from('not a real docx'));
    await expect(extractText(file, 'r.docx')).resolves.toBeTypeOf('string');
  });
});

describe('tailorResume', () => {
  const job = { title: 'Engineer', company: 'Acme', description: 'Build things with JS' };

  it('returns the trimmed summary and skills from the model', async () => {
    generate.mockResolvedValue('```json\n{"summary":" A summary ","skills":" js, node "}\n```');
    await expect(tailorResume('my resume', job)).resolves.toEqual({ summary: 'A summary', skills: 'js, node' });
    expect(generate.mock.calls[0][0]).toContain('Title: Engineer');
  });

  it('throws when the response is not parseable json', async () => {
    generate.mockResolvedValue('sorry, no');
    await expect(tailorResume('my resume', job)).rejects.toThrow('Could not parse AI response into JSON');
  });

  it('throws when the parsed result is empty', async () => {
    generate.mockResolvedValue('{"summary":"","skills":""}');
    await expect(tailorResume('my resume', job)).rejects.toThrow('AI returned empty tailoring result');
  });

  it('tolerates a job with no description', async () => {
    generate.mockResolvedValue('{"summary":"s","skills":""}');
    await expect(tailorResume('my resume', { title: 'T', company: 'C' })).resolves.toEqual({ summary: 's', skills: '' });
  });
});

describe('applyTailoring', () => {
  it('replaces an existing summary section', () => {
    const content = '# Summary\n\nold text\n\n# Experience\n\nstuff\n';
    const out = applyTailoring(content, 'new summary', '');
    expect(out).toContain('# Professional Summary\n\nnew summary');
    expect(out).not.toContain('old text');
    expect(out).toContain('# Experience');
  });

  it('prepends a summary when the resume has none', () => {
    const out = applyTailoring('# Experience\n\nstuff', 'new summary', '');
    expect(out.startsWith('# Professional Summary\n\nnew summary')).toBe(true);
    expect(out).toContain('# Experience');
  });

  it('replaces an existing skills section', () => {
    const content = '# Skills\n\nold skills\n\n# Experience\n\nstuff\n';
    const out = applyTailoring(content, '', 'js, node');
    expect(out).toContain('# Skills\n\njs, node');
    expect(out).not.toContain('old skills');
  });

  it('appends skills when the resume has none', () => {
    const out = applyTailoring('# Experience\n\nstuff', '', 'js, node');
    expect(out.trimEnd().endsWith('# Skills\n\njs, node')).toBe(true);
  });

  it('applies both sections together', () => {
    const content = '# Summary\n\nold\n\n# Skills\n\nold skills\n';
    const out = applyTailoring(content, 'new summary', 'js');
    expect(out).toContain('new summary');
    expect(out).toContain('# Skills\n\njs');
  });

  it('appends skills alongside a prepended summary', () => {
    const out = applyTailoring('# Experience\n\nAcme', 'new summary', 'js, node');
    expect(out).toContain('# Professional Summary\n\nnew summary');
    expect(out).toContain('# Skills\n\njs, node');
  });

  it('returns the trimmed content unchanged when nothing is provided', () => {
    expect(applyTailoring('  body  ', '', '')).toBe('body');
  });
});
