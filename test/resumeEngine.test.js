import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTailoring, formatOf, isSupported } from '../backend/resumeEngine.js';

test('applyTailoring replaces an existing summary section', () => {
  const resume = '# Summary\n\nOld summary.\n\n# Experience\n\nAcme Corp\n';
  const out = applyTailoring(resume, 'New summary.', '');
  assert.match(out, /# Professional Summary\n\nNew summary\./);
  assert.doesNotMatch(out, /Old summary/);
  assert.match(out, /# Experience/);
});

test('applyTailoring appends a skills block when the resume has none', () => {
  const resume = '# Experience\n\nAcme Corp\n';
  const out = applyTailoring(resume, 'New summary.', 'Node.js, SQL');
  assert.match(out, /# Professional Summary/);
  assert.match(out, /# Skills\n\nNode\.js, SQL/);
});

test('applyTailoring replaces an existing skills section', () => {
  const resume = '# Skills\n\nCobol\n\n# Experience\n\nAcme Corp\n';
  const out = applyTailoring(resume, '', 'Node.js, SQL');
  assert.match(out, /# Skills\n\nNode\.js, SQL/);
  assert.doesNotMatch(out, /Cobol/);
  assert.equal(out.match(/# Skills/g).length, 1);
});

test('applyTailoring leaves content untouched with no tailoring', () => {
  const resume = '# Experience\n\nAcme Corp';
  assert.equal(applyTailoring(resume, '', ''), resume);
});

test('formatOf and isSupported cover the accepted extensions', () => {
  assert.equal(formatOf('cv.PDF'), 'pdf');
  assert.equal(formatOf('cv.docx'), 'docx');
  assert.equal(formatOf('cv.pages'), 'unknown');
  assert.equal(isSupported('cv.md'), true);
  assert.equal(isSupported('cv.pages'), false);
});
