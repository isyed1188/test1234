import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  all, get, run, log, getSetting, setSetting
} from './database.js';
import { importFrom, importAll, knownSources, startEnricher } from './scraper.js';
import { checkHealth } from './ollama.js';
import { extractText, isSupported, tailorResume, applyTailoring } from './resumeEngine.js';
import { sendDiscord, buildDigestMessage } from './notifier.js';
import { assertDiscordWebhook, assertHttpUrl, assertSlug, clampText } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '127.0.0.1';
const uploadsDir = path.join(__dirname, '..', 'uploads');
const tailoredDir = path.join(__dirname, '..', 'data', 'tailored_resumes');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(tailoredDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '5mb' }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const APPLICATION_STATUSES = new Set([
  'PENDING', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'ARCHIVED'
]);

function nowIso() {
  return new Date().toISOString();
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Express 4 does not forward rejections from async handlers: an async route that
// throws leaves the request hanging until the client gives up. Wrapping every
// handler funnels both sync throws and rejections into the error middleware.
function route(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

function uploadSingle(field) {
  const handler = upload.single(field);
  return (req, res, next) => handler(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(httpError(400, err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 15MB)'
        : `Upload rejected: ${err.message}`));
    }
    return next(err);
  });
}

app.get('/api/health', route(async (req, res) => {
  const llm = await checkHealth();
  res.json({ ok: true, llm, time: nowIso() });
}));

app.get('/api/stats', route((req, res) => {
  const totalJobs = get('SELECT COUNT(*) AS c FROM jobs').c;
  const totalApplications = get('SELECT COUNT(*) AS c FROM applications').c;
  const byStatus = all(
    `SELECT status, COUNT(*) AS c FROM applications GROUP BY status`
  );
  const bySource = all(`SELECT source, COUNT(*) AS c FROM jobs GROUP BY source`);
  const byWorkMode = all(`SELECT work_mode, COUNT(*) AS c FROM jobs GROUP BY work_mode`);
  const avgRelevance = get('SELECT AVG(relevance_score) AS a FROM jobs').a || 0;
  const hasApp = get('SELECT COUNT(DISTINCT job_id) AS c FROM applications WHERE status != ?', ['PENDING']).c;
  res.json({
    totalJobs,
    totalApplications,
    appliedJobs: hasApp,
    avgRelevance: Math.round(avgRelevance),
    byStatus,
    bySource,
    byWorkMode
  });
}));

class BadRequest extends Error {}

const APPLICATION_STATUSES = ['PENDING', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'ARCHIVED'];

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildJobFilter(req) {
  const { q, work_mode, experience_level, source, min_relevance, salary_bucket, status } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push(
      `(title LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\'
        OR description LIKE ? ESCAPE '\\' OR skills LIKE ? ESCAPE '\\')`
    );
    const like = `%${escapeLike(String(q))}%`;
    params.push(like, like, like, like);
  }
  if (work_mode) { where.push('work_mode = ?'); params.push(work_mode); }
  if (experience_level) { where.push('experience_level = ?'); params.push(experience_level); }
  if (source) { where.push('source = ?'); params.push(source); }
  if (min_relevance !== undefined && min_relevance !== '') {
    const value = Number(min_relevance);
    if (!Number.isFinite(value)) throw new BadRequest('min_relevance must be a number');
    where.push('relevance_score >= ?');
    params.push(value);
  }
  if (salary_bucket) {
    const value = Number(salary_bucket);
    if (!Number.isFinite(value)) throw new BadRequest('salary_bucket must be a number');
    where.push('(salary_max IS NOT NULL AND salary_max >= ?)');
    params.push(value);
  }
  if (status === 'applied') {
    where.push("EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id AND a.status != 'PENDING')");
  }
  if (status === 'saved') {
    where.push('NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)');
  }
  return { where, params };
}

app.get('/api/jobs', (req, res) => {
  let filter;
  try {
    filter = buildJobFilter(req);
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    throw err;
  }
  const { where, params } = filter;
app.get('/api/jobs', route((req, res) => {
  const { where, params } = buildJobFilter(req);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const jobs = all(
    `SELECT jobs.*,
       (SELECT COUNT(*) FROM applications a WHERE a.job_id = jobs.id) AS application_count,
       (SELECT a.status FROM applications a WHERE a.job_id = jobs.id ORDER BY a.id DESC LIMIT 1) AS application_status
     FROM jobs ${whereSql}
     ORDER BY jobs.relevance_score DESC, jobs.fetched_at DESC
     LIMIT 500`,
    params
  );
  res.json(jobs);
}));

app.get('/api/jobs/:id', route((req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) throw httpError(404, 'Job not found');
  const applications = all('SELECT * FROM applications WHERE job_id = ? ORDER BY id DESC', [job.id]);
  res.json({ ...job, applications });
}));

app.patch('/api/jobs/:id', route((req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) throw httpError(404, 'Job not found');
  const updates = [];
  const params = [];
  if (req.body.relevance_score !== undefined) {
    updates.push('relevance_score = ?');
    params.push(Number(req.body.relevance_score) || 0);
  }
  if (req.body.skills !== undefined) {
    updates.push('skills = ?');
    params.push(String(req.body.skills));
  }
  if (!updates.length) throw httpError(400, 'Nothing to update');
  params.push(req.params.id);
  run(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json(get('SELECT * FROM jobs WHERE id = ?', [req.params.id]));
}));

app.get('/api/sources', route((req, res) => {
  res.json(knownSources());
}));

app.post('/api/import', route(async (req, res) => {
  const { source, company, keyword } = req.body || {};
  if (!source || !company) throw httpError(400, 'source and company required');
  try {
    assertSlug(company, 'company');
  } catch (err) {
    throw httpError(400, err.message);
  }
  try {
    const count = await importFrom(source, company, clampText(keyword, 200));
    log('info', `imported ${count} jobs from ${source}/${company}`);
    res.json({ imported: count });
  } catch (err) {
    log('error', `import failed ${source}/${company}: ${err.message}`);
    throw httpError(502, err.message);
  }
}));

app.post('/api/import/all', route(async (req, res) => {
  const { keyword } = req.body || {};
  try {
    const results = await importAll(null, clampText(keyword, 200));
    res.json(results);
  } catch (err) {
    log('error', `import all failed: ${err.message}`);
    throw httpError(502, err.message);
  }
}));

app.get('/api/applications', route((req, res) => {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE a.status = ?';
    params.push(status);
  }
  const apps = all(
    `SELECT a.*, j.title AS job_title, j.company, j.url, j.source, j.location,
       r.name AS resume_name, r.filename AS resume_filename
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     LEFT JOIN resumes r ON r.id = a.resume_id
     ${where}
     ORDER BY a.id DESC`,
    params
  );
  res.json(apps);
}));

app.post('/api/applications', route((req, res) => {
  const { job_id, resume_id, portal, notes, status } = req.body || {};
  if (!job_id) throw httpError(400, 'job_id required');
  const job = get('SELECT id FROM jobs WHERE id = ?', [job_id]);
  if (!job) throw httpError(404, 'Job not found');
  if (resume_id && !get('SELECT id FROM resumes WHERE id = ?', [resume_id])) {
    throw httpError(404, 'Resume not found');
  }
  const st = status || 'PENDING';
  if (!APPLICATION_STATUSES.includes(st)) {
    return res.status(400).json({ error: `status must be one of ${APPLICATION_STATUSES.join(', ')}` });
  if (!APPLICATION_STATUSES.has(st)) {
    throw httpError(400, `status must be one of ${[...APPLICATION_STATUSES].join(', ')}`);
  }
  const result = run(
    `INSERT INTO applications (job_id, status, portal, resume_id, notes, applied_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [job_id, st, portal ? clampText(portal, 200) : null, resume_id || null,
     notes ? clampText(notes, 5000) : null,
     st === 'PENDING' ? null : nowIso(), nowIso()]
  );
  log('info', `application #${result.lastInsertRowid} created for job ${job_id} status=${st}`);
  res.json(get('SELECT * FROM applications WHERE id = ?', [result.lastInsertRowid]));
}));

app.patch('/api/applications/:id', route((req, res) => {
  const existing = get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!existing) throw httpError(404, 'Application not found');
  const body = req.body || {};
  const updates = [];
  const params = [];
  if (req.body.status !== undefined) {
    if (!APPLICATION_STATUSES.includes(String(req.body.status))) {
      return res.status(400).json({ error: `status must be one of ${APPLICATION_STATUSES.join(', ')}` });
  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.has(String(body.status))) {
      throw httpError(400, `status must be one of ${[...APPLICATION_STATUSES].join(', ')}`);
    }
    updates.push('status = ?');
    params.push(String(body.status));
    if (body.status !== 'PENDING' && !existing.applied_at) {
      updates.push('applied_at = ?');
      params.push(nowIso());
    }
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(clampText(body.notes, 5000));
  }
  if (body.portal !== undefined) {
    updates.push('portal = ?');
    params.push(clampText(body.portal, 200));
  }
  if (!updates.length) throw httpError(400, 'Nothing to update');
  params.push(req.params.id);
  run(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json(get('SELECT * FROM applications WHERE id = ?', [req.params.id]));
}));

function csvEscape(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const EXPORT_COLUMNS = [
  ['Job ID', 'id'],
  ['Title', 'title'],
  ['Company', 'company'],
  ['Category', 'category'],
  ['Location', 'location'],
  ['Work Mode', 'work_mode'],
  ['Experience Level', 'experience_level'],
  ['Salary Min', 'salary_min'],
  ['Salary Max', 'salary_max'],
  ['Currency', 'salary_currency'],
  ['URL', 'url'],
  ['Source', 'source'],
  ['Status', 'status'],
  ['Portal', 'portal'],
  ['Applied At', 'applied_at'],
  ['Notes', 'notes'],
  ['Resume Filename', 'resume_filename']
];

app.get('/api/applications/export', (req, res) => {
app.get('/api/applications/export', route((req, res) => {
  const rows = all(
    `SELECT j.id, j.title, j.company, j.category, j.location, j.work_mode, j.experience_level,
       j.salary_min, j.salary_max, j.salary_currency, j.url, j.source,
       a.status, a.portal, a.applied_at, a.notes, r.filename AS resume_filename
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     LEFT JOIN resumes r ON r.id = a.resume_id
     ORDER BY a.id DESC`
  );
  const lines = [EXPORT_COLUMNS.map(([header]) => csvEscape(header)).join(',')];
  for (const r of rows) {
    lines.push(EXPORT_COLUMNS.map(([, key]) => csvEscape(r[key])).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
  res.send(lines.join('\n'));
}));

app.get('/api/resumes', route((req, res) => {
  const resumes = all('SELECT * FROM resumes ORDER BY is_baseline DESC, id DESC');
  res.json(resumes);
}));

function discardUpload(file) {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch (err) {
    if (err.code !== 'ENOENT') log('error', `could not remove rejected upload ${file.path}: ${err.message}`);
  }
}

app.post('/api/resumes/upload', uploadSingle('file'), route(async (req, res) => {
  if (!req.file) throw httpError(400, 'No file uploaded');
  if (!isSupported(req.file.originalname)) {
    discardUpload(req.file);
    throw httpError(400, 'Unsupported format. Use PDF, DOCX, DOC, TXT or MD');
  }
  let content;
  try {
    content = await extractText(req.file.path, req.file.originalname);
  } catch (err) {
    discardUpload(req.file);
    log('error', `resume text extraction failed for ${req.file.originalname}: ${err.message}`);
    throw httpError(422, `Could not read text from ${req.file.originalname}: ${err.message}`);
  }
  if (!content) {
    discardUpload(req.file);
    throw httpError(422, `No text could be extracted from ${req.file.originalname}. If it is a scanned PDF, upload a text-based version.`);
  }
  const baseline = get('SELECT COUNT(*) AS c FROM resumes').c === 0 ? 1 : 0;
  const result = run(
    `INSERT INTO resumes (name, filename, original_name, format, content, is_baseline, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [path.basename(req.file.originalname), req.file.filename, req.file.originalname,
     req.file.originalname.split('.').pop().toLowerCase(), content, baseline, nowIso()]
  );
  log('info', `resume uploaded: ${req.file.originalname} (${content.length} chars)`);
  res.json(get('SELECT * FROM resumes WHERE id = ?', [result.lastInsertRowid]));
}));

app.post('/api/resumes/:id/baseline', (req, res) => {
  const resume = get('SELECT id FROM resumes WHERE id = ?', [req.params.id]);
  if (!resume) return res.status(404).json({ error: 'Resume not found' });
  run('BEGIN');
  try {
    run('UPDATE resumes SET is_baseline = 0');
    run('UPDATE resumes SET is_baseline = 1 WHERE id = ?', [req.params.id]);
    run('COMMIT');
  } catch (err) {
    run('ROLLBACK');
    throw err;
  }
app.post('/api/resumes/:id/baseline', route((req, res) => {
  const resume = get('SELECT id FROM resumes WHERE id = ?', [req.params.id]);
  if (!resume) throw httpError(404, 'Resume not found');
  run('UPDATE resumes SET is_baseline = 0');
  run('UPDATE resumes SET is_baseline = 1 WHERE id = ?', [req.params.id]);
  res.json(get('SELECT * FROM resumes WHERE id = ?', [req.params.id]));
}));

app.post('/api/resumes/:id/tailor', route(async (req, res) => {
  const resume = get('SELECT * FROM resumes WHERE id = ?', [req.params.id]);
  if (!resume) throw httpError(404, 'Resume not found');
  const { job_id } = req.body || {};
  if (!job_id) throw httpError(400, 'job_id required');
  const job = get('SELECT * FROM jobs WHERE id = ?', [job_id]);
  if (!job) throw httpError(404, 'Job not found');
  if (!resume.content) throw httpError(422, 'This resume has no extracted text to tailor');
  try {
    const { summary, skills } = await tailorResume(resume.content, job);
    const tailored = applyTailoring(resume.content, summary, skills);
    const baseName = path.basename(resume.filename, path.extname(resume.filename));
    const outName = `${baseName}-tailored-${job_id}.md`;
    const outPath = path.join(tailoredDir, outName);
    fs.writeFileSync(outPath, tailored);
    const result = run(
      `INSERT INTO resumes (name, filename, original_name, format, content, is_baseline, tailored_for_job_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [`${resume.original_name} (tailored for ${job.company} ${job.title})`, outName,
       resume.original_name, 'md', tailored, job_id, nowIso()]
    );
    log('info', `tailored resume created for job ${job_id} -> ${outName}`);
    res.json(get('SELECT * FROM resumes WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) {
    log('error', `tailor failed for resume ${req.params.id} / job ${job_id}: ${err.message}`);
    throw httpError(err.status || 502, err.message);
  }
}));

app.get('/api/profile', route((req, res) => {
  const profile = getSetting('profile', {});
  res.json(profile);
}));

app.put('/api/profile', route((req, res) => {
  const { name, email, phone, location, headline, skills, url, salary_target, cover_letter } = req.body || {};
  const profile = {
    name: clampText(name, 200),
    email: clampText(email, 320),
    phone: clampText(phone, 50),
    location: clampText(location, 200),
    headline: clampText(headline, 500),
    skills: Array.isArray(skills) ? skills.slice(0, 200).map((s) => clampText(s, 100)) : [],
    url: clampText(url, 2000),
    salary_target: clampText(salary_target, 100),
    cover_letter: clampText(cover_letter, 20000)
  };
  setSetting('profile', profile);
  log('info', 'profile updated');
  res.json(profile);
}));

app.get('/api/settings', route((req, res) => {
  const out = {};
  for (const k of ['llmMode', 'llmHost', 'llmModel']) out[k] = getSetting(k, '');
  out.discordWebhookSet = Boolean(getSetting('discordWebhook', ''));
  out.profile = getSetting('profile', {});
  res.json(out);
}));

function isDiscordWebhook(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(url.hostname)
      && url.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

app.put('/api/settings', (req, res) => {
  const keys = ['llmMode', 'llmHost', 'llmModel', 'discordWebhook'];
  if (req.body.discordWebhook !== undefined && !isDiscordWebhook(String(req.body.discordWebhook))) {
    return res.status(400).json({ error: 'discordWebhook must be an https://discord.com/api/webhooks/... URL' });
  }
  for (const k of keys) {
    if (req.body[k] !== undefined) setSetting(k, String(req.body[k]));
app.put('/api/settings', route((req, res) => {
  const body = req.body || {};
  try {
    if (body.llmMode !== undefined) {
      const mode = String(body.llmMode);
      if (mode !== 'ollama' && mode !== 'lmstudio') {
        throw httpError(400, 'llmMode must be ollama or lmstudio');
      }
      setSetting('llmMode', mode);
    }
    if (body.llmHost !== undefined) {
      const host = String(body.llmHost);
      if (host) assertHttpUrl(host, 'LLM host');
      setSetting('llmHost', host);
    }
    if (body.llmModel !== undefined) {
      setSetting('llmModel', clampText(body.llmModel, 200));
    }
    if (body.discordWebhook !== undefined) {
      const webhook = String(body.discordWebhook);
      setSetting('discordWebhook', webhook ? assertDiscordWebhook(webhook) : '');
    }
  } catch (err) {
    throw httpError(err.status || 400, err.message);
  }
  res.json({ ok: true });
}));

app.post('/api/notify/test', route(async (req, res) => {
  const webhook = getSetting('discordWebhook', '');
  if (!webhook) throw httpError(400, 'No Discord webhook configured');
  try {
    await sendDiscord(webhook, 'JobHunt Coach connected successfully.');
    res.json({ ok: true });
  } catch (err) {
    log('error', `Discord test failed: ${err.message}`);
    throw httpError(502, err.message);
  }
}));

app.post('/api/notify/digest', route(async (req, res) => {
  const webhook = getSetting('discordWebhook', '');
  if (!webhook) throw httpError(400, 'No Discord webhook configured');
  try {
    await sendDiscord(webhook, buildDigestMessage());
    log('info', 'manual digest sent to Discord');
    res.json({ ok: true });
  } catch (err) {
    log('error', `manual digest failed: ${err.message}`);
    throw httpError(502, err.message);
  }
}));

app.get('/api/logs', route((req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const logs = all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
  res.json(logs);
}));

const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, HOST, () => {
  log('info', `server listening on http://${HOST}:${PORT}`);
  console.log(`JobHunt Coach running at http://${HOST}:${PORT}`);
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  // Deliberate failures are already logged where they are raised; anything
  // without a status reached here unexpectedly and needs its stack.
  if (!err.status && status >= 500) {
    log('error', `${req.method} ${req.originalUrl} failed: ${err.stack || err.message}`);
  }
  if (res.headersSent) return next(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  log('error', `unhandled promise rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});

process.on('uncaughtException', (err) => {
  log('error', `uncaught exception: ${err.stack || err.message}`);
  process.exit(1);
});

const server = app.listen(PORT, HOST, () => {
  log('info', `server listening on http://${HOST}:${PORT}`);
  console.log(`JobHunt Coach running at http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  const detail = err.code === 'EADDRINUSE'
    ? `port ${PORT} is already in use — stop the other process or set PORT to a free port`
    : err.message;
  log('error', `server failed to start: ${detail}`);
  process.exit(1);
});

startEnricher();
