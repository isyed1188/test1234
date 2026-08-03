import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWorkMode, detectExperience, parseSalary, relevanceScore } from '../backend/scraper.js';

test('detectWorkMode honours negated remote wording', () => {
  assert.equal(detectWorkMode('Senior SRE (Remote)', 'US', ''), 'Remote');
  assert.equal(detectWorkMode('Senior SRE', 'Austin, TX', 'This role is not remote.'), 'Onsite');
  assert.equal(detectWorkMode('Senior SRE', 'Austin, TX', 'No remote option available.'), 'Onsite');
  assert.equal(detectWorkMode('Analyst', 'NYC', 'Hybrid schedule, 3 days onsite.'), 'Hybrid');
  assert.equal(detectWorkMode('Analyst', 'NYC', ''), 'Onsite');
});

test('detectExperience picks the most senior match', () => {
  assert.equal(detectExperience('VP of Engineering', ''), 'Director');
  assert.equal(detectExperience('Staff Engineer', ''), 'Staff');
  assert.equal(detectExperience('Sr. Data Engineer', ''), 'Senior');
  assert.equal(detectExperience('Software Engineer', ''), 'Not specified');
});

test('parseSalary reads real ranges and rejects non-salaries', () => {
  assert.deepEqual(parseSalary('Base pay $120,000 - $150,000 per year'), { min: 120000, max: 150000 });
  assert.deepEqual(parseSalary('Compensation: $180k'), { min: 180000, max: 180000 });
  assert.equal(parseSalary('Founded 2020-2024, req id 118-220'), null);
  assert.equal(parseSalary(''), null);
  assert.equal(parseSalary(null), null);
});

test('relevanceScore matches whole skill tokens only', () => {
  const profile = { skills: ['Go', 'SQL'] };
  assert.equal(relevanceScore(profile, 'Backend Engineer', 'We use Go and SQL daily.'), 100);
  assert.equal(relevanceScore(profile, 'Backend Engineer', 'We use Google Cloud and SQLite.'), 0);
  assert.equal(relevanceScore({ skills: [] }, 'Anything', 'Anything'), 0);
});
