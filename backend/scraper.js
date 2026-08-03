import { all, run, log, getSetting } from './database.js';
import { fetchWithTimeout, fetchJson, postJson } from './http.js';

const GREENHOUSE_SOURCES = [
  'gitlab', 'datadog', 'coinbase', 'reddit', 'dropbox',
  'instacart', 'brex', 'airtable', 'stripe', 'asana', 'gusto',
  'chime', 'vercel', 'brave', 'sofi', 'applovin', 'duolingo'
];

const LEVER_SOURCES = [
  'plaid', 'farfetch', 'webfx'
];

const WORKDAY_SOURCES = [
  { company: 'Bank of America', slug: 'bankofamerica', domain: 'ghr.wd1.myworkdayjobs.com', tenant: 'ghr', site: 'lateral-us' },
  { company: 'Target', slug: 'target', domain: 'target.wd5.myworkdayjobs.com', tenant: 'target', site: 'TargetCareers' },
  { company: 'Amgen', slug: 'amgen', domain: 'amgen.wd1.myworkdayjobs.com', tenant: 'amgen', site: 'Careers' },
  { company: 'Boeing', slug: 'boeing', domain: 'boeing.wd1.myworkdayjobs.com', tenant: 'boeing', site: 'EXTERNAL_CAREERS' },
  { company: 'Citigroup', slug: 'citigroup', domain: 'citi.wd5.myworkdayjobs.com', tenant: 'citi', site: '2' },
  { company: 'Comcast', slug: 'comcast', domain: 'comcast.wd5.myworkdayjobs.com', tenant: 'comcast', site: 'Comcast_Careers' },
  { company: 'Micron', slug: 'micron', domain: 'micron.wd1.myworkdayjobs.com', tenant: 'micron', site: 'External' },
  { company: 'Nike', slug: 'nike', domain: 'nike.wd1.myworkdayjobs.com', tenant: 'nike', site: 'nke' },
  { company: 'Intel', slug: 'intel', domain: 'intel.wd1.myworkdayjobs.com', tenant: 'intel', site: 'EXTERNAL' }
];

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectWorkMode(title, location, content) {
  const t = `${title} ${location} ${content}`.toLowerCase();
  if (t.includes('remote')) return 'Remote';
  if (t.includes('hybrid')) return 'Hybrid';
  return 'Onsite';
}

export function detectExperience(title, content) {
  const t = `${title} ${content}`.toLowerCase();
  if (/director|vice president|\bvp\b/.test(t)) return 'Director';
  if (/principal/.test(t)) return 'Principal';
  if (/staff/.test(t)) return 'Staff';
  if (/senior|\bsr\.?\b/.test(t)) return 'Senior';
  if (/\blead\b|manager/.test(t)) return 'Lead';
  if (/junior|entry|graduate/.test(t)) return 'Junior';
  return 'Not specified';
}

function parseSalary(text) {
  const clean = String(text || '').replace(/[,\s]/g, '');
  const range = clean.match(/\$?(\d{3,})\s*[-–—to]+\s*\$?(\d{3,})/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min && max && min <= max) return { min, max };
  }
  const single = clean.match(/\$?(\d{3,})k/i);
  if (single) {
    const v = Number(single[1]) * 1000;
    return { min: v, max: v };
  }
  return null;
}

function relevanceScore(profile, title, content) {
  const skills = profile?.skills || [];
  if (!skills.length) return 0;
  const haystack = `${title} ${content}`.toLowerCase();
  let hits = 0;
  for (const s of skills) {
    const skill = String(s || '').trim();
    if (skill && haystack.includes(skill.toLowerCase())) hits++;
  }
  return Math.min(100, Math.round((hits / skills.length) * 100));
}

function saveJob(job) {
  try {
    const result = run(
      `INSERT INTO jobs
        (external_id, source, title, company, location, work_mode, experience_level,
         salary_min, salary_max, salary_currency, url, description, skills, category,
         relevance_score, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_id) DO UPDATE SET
         title = excluded.title, company = excluded.company, location = excluded.location,
         work_mode = excluded.work_mode, experience_level = excluded.experience_level,
         salary_min = excluded.salary_min, salary_max = excluded.salary_max,
         salary_currency = excluded.salary_currency, url = excluded.url,
         description = excluded.description, relevance_score = excluded.relevance_score,
         fetched_at = excluded.fetched_at`,
      [
        job.external_id, job.source, job.title, job.company, job.location, job.work_mode,
        job.experience_level, job.salary_min, job.salary_max, job.salary_currency,
        job.url, job.description, job.skills, job.category, job.relevance_score,
        new Date().toISOString()
      ]
    );
    return result.changes > 0;
  } catch (err) {
    log('error', `save job failed: ${err.message}`);
    return false;
  }
}

function loadProfile() {
  return getSetting('profile', {});
}

async function importGreenhouse(company, keyword, profile) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs`);
  const jobs = data.jobs || [];
  let count = 0;
  for (const j of jobs) {
    const title = j.title || '';
    if (keyword && !title.toLowerCase().includes(keyword.toLowerCase())) continue;
    const location = j.location?.name || '';
    const job = {
      external_id: `gh-${company}-${j.id}`,
      source: 'Greenhouse',
      title,
      company,
      location,
      work_mode: detectWorkMode(title, location, ''),
      experience_level: detectExperience(title, ''),
      salary_min: null,
      salary_max: null,
      salary_currency: 'USD',
      url: j.absolute_url || '',
      description: '',
      skills: '',
      category: j.departments?.[0]?.name || '',
      relevance_score: relevanceScore(profile, title, '')
    };
    if (saveJob(job)) count++;
  }
  return count;
}

async function importLever(company, keyword, profile) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${company}?mode=json`, 90000);
  const jobs = Array.isArray(data) ? data : [];
  let count = 0;
  for (const j of jobs) {
    const title = j.text || j.title || '';
    const content = stripHtml(j.descriptionPlain || j.description || '');
    const lower = `${title} ${content}`.toLowerCase();
    if (keyword && !lower.includes(keyword.toLowerCase())) continue;
    const location = (j.categories?.allLocations || [j.categories?.location].filter(Boolean)).join(', ');
    const salary = j.salaryRange ? { min: j.salaryRange.min, max: j.salaryRange.max } : null;
    const job = {
      external_id: `lv-${company}-${j.id}`,
      source: 'Lever',
      title,
      company,
      location,
      work_mode: detectWorkMode(title, location, content),
      experience_level: detectExperience(title, content),
      salary_min: salary?.min ?? null,
      salary_max: salary?.max ?? null,
      salary_currency: j.salaryRange?.currency || 'USD',
      url: j.hostedUrl || '',
      description: content.slice(0, 20000),
      skills: '',
      category: (j.categories?.team || '').trim(),
      relevance_score: relevanceScore(profile, title, content)
    };
    if (saveJob(job)) count++;
  }
  return count;
}

async function importWorkday(cfg, keyword, profile) {
  const base = `https://${cfg.domain}/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`;
  let offset = 0;
  let count = 0;
  let total = Infinity;
  while (offset < total && offset < 600) {
    const data = await postJson(base, { appliedFacets: {}, limit: 20, offset });
    total = data.total || 0;
    const jobs = data.jobPostings || [];
    if (!jobs.length) break;
    for (const j of jobs) {
      const title = j.title || '';
      if (keyword && !title.toLowerCase().includes(keyword.toLowerCase())) continue;
      const location = j.locationsText || '';
      const pathId = (j.externalPath || '').match(/_([A-Za-z0-9][A-Za-z0-9-]*)$/);
      const id = pathId ? pathId[1] : encodeURIComponent(j.externalPath || `${offset}-${jobs.indexOf(j)}`);
      const job = {
        external_id: `wd-${cfg.slug}-${id}`,
        source: 'Fortune 500',
        title,
        company: cfg.company,
        location,
        work_mode: detectWorkMode(title, location, ''),
        experience_level: detectExperience(title, ''),
        salary_min: null,
        salary_max: null,
        salary_currency: 'USD',
        url: `https://${cfg.domain}/en-US/${cfg.site}${j.externalPath || ''}`,
        description: '',
        skills: '',
        category: '',
        relevance_score: relevanceScore(profile, title, '')
      };
      if (saveJob(job)) count++;
    }
    offset += jobs.length;
  }
  return count;
}

export async function importFrom(source, company, keyword) {
  const profile = loadProfile();
  log('info', `importing ${source} board "${company}" keyword="${keyword || '*'}"`);
  const lower = String(source).toLowerCase();
  if (lower.includes('greenhouse')) return importGreenhouse(company, keyword, profile);
  if (lower.includes('lever')) return importLever(company, keyword, profile);
  if (lower.includes('workday') || lower.includes('fortune')) {
    const cfg = WORKDAY_SOURCES.find((c) => c.slug === company);
    if (!cfg) throw new Error(`Unknown Fortune 500 board: ${company}`);
    return importWorkday(cfg, keyword, profile);
  }
  throw new Error(`Unknown source: ${source}`);
}

export async function importAll(sources, keyword) {
  const chosen = sources || { greenhouse: GREENHOUSE_SOURCES, lever: LEVER_SOURCES, workday: WORKDAY_SOURCES.map((c) => c.slug) };
  const profile = loadProfile();
  const results = { greenhouse: {}, lever: {}, workday: {} };
  const ghCompanies = Array.isArray(chosen.greenhouse) ? chosen.greenhouse : GREENHOUSE_SOURCES;
  const lvCompanies = Array.isArray(chosen.lever) ? chosen.lever : LEVER_SOURCES;
  const wdCompanies = Array.isArray(chosen.workday) ? chosen.workday : WORKDAY_SOURCES.map((c) => c.slug);

  for (const company of ghCompanies) {
    try {
      const n = await importGreenhouse(company, keyword, profile);
      results.greenhouse[company] = n;
    } catch (err) {
      results.greenhouse[company] = `error: ${err.message}`;
    }
  }
  for (const company of lvCompanies) {
    try {
      const n = await importLever(company, keyword, profile);
      results.lever[company] = n;
    } catch (err) {
      results.lever[company] = `error: ${err.message}`;
    }
  }
  for (const company of wdCompanies) {
    try {
      const cfg = WORKDAY_SOURCES.find((c) => c.slug === company);
      if (!cfg) {
        results.workday[company] = 'error: unknown board';
        continue;
      }
      const n = await importWorkday(cfg, keyword, profile);
      results.workday[company] = n;
    } catch (err) {
      results.workday[company] = `error: ${err.message}`;
    }
  }
  log('info', `importAll complete: greenhouse=${JSON.stringify(results.greenhouse)} lever=${JSON.stringify(results.lever)} workday=${JSON.stringify(results.workday)}`);
  return results;
}

function applyEnrichment(row, { title, content, location, url }) {
  const salary = parseSalary(content);
  const fields = {
    description: content.slice(0, 20000),
    location,
    work_mode: detectWorkMode(title, location, content),
    experience_level: detectExperience(title, content),
    salary_min: salary?.min ?? null,
    salary_max: salary?.max ?? null,
    salary_currency: 'USD',
    relevance_score: relevanceScore(loadProfile(), title, content)
  };
  if (url !== undefined) fields.url = url;
  const cols = Object.keys(fields);
  run(
    `UPDATE jobs SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => fields[c]), row.id]
  );
}

async function enrichGreenhouseJob(row) {
  const m = row.external_id.match(/^gh-(.+)-(\d+)$/);
  if (!m) return false;
  const company = m[1];
  const jobId = m[2];
  try {
    const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}`);
    const title = data.title || row.title || '';
    const content = stripHtml(data.content);
    const location = data.location?.name || row.location || '';
    applyEnrichment(row, {
      title,
      content,
      location,
      url: data.absolute_url || row.url || ''
    });
    return true;
  } catch (err) {
    run('UPDATE jobs SET fetched_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
    return false;
  }
}

function extractLdJson(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/&amp;/g, '&'));
  } catch {
    return null;
  }
}

async function enrichWorkdayJob(row) {
  const m = row.external_id.match(/^wd-([^-]+)-(.+)$/);
  if (!m) return false;
  const cfg = WORKDAY_SOURCES.find((c) => c.slug === m[1]);
  if (!cfg) return false;
  try {
    const res = await fetchWithTimeout(row.url, {
      timeoutMs: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = extractLdJson(html);
    if (!data || !data.description) return false;
    const content = stripHtml(data.description);
    const title = data.title || row.title || '';
    const location = data.jobLocation?.address?.addressLocality || row.location || '';
    applyEnrichment(row, { title, content, location });
    return true;
  } catch (err) {
    return false;
  }
}

let enriching = false;

async function enrichOnce() {
  if (enriching) return;
  enriching = true;
  try {
    const rows = all(
      `SELECT id, external_id, title, company, location, url
       FROM jobs
       WHERE (description IS NULL OR description = '')
         AND source IN ('Greenhouse', 'Fortune 500')
       ORDER BY CASE WHEN source = 'Fortune 500' THEN 0 ELSE 1 END, id ASC
       LIMIT 15`
    );
    if (rows.length === 0) return;
    const results = await Promise.all(rows.map((row) => {
      const fn = row.external_id.startsWith('wd-') ? enrichWorkdayJob : enrichGreenhouseJob;
      return fn(row).catch((e) => {
        log('error', `enrich row failed ${row.external_id}: ${e.message}`);
        return false;
      });
    }));
    log('info', `enriched batch: ${results.filter(Boolean).length}/${rows.length} (${rows[0].external_id} .. ${rows[rows.length - 1].external_id})`);
  } catch (err) {
    log('error', `enrichOnce error: ${err.message}`);
  } finally {
    enriching = false;
  }
}

export function startEnricher() {
  setInterval(() => {
    enrichOnce().catch(() => {});
  }, 4000);
  setTimeout(() => enrichOnce().catch(() => {}), 1000);
  log('info', 'background job description enricher started');
}

export function knownSources() {
  return {
    greenhouse: GREENHOUSE_SOURCES,
    lever: LEVER_SOURCES,
    workday: WORKDAY_SOURCES.map((c) => c.company)
  };
}
