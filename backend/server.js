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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const uploadsDir = path.join(__dirname, '..', 'uploads');
const tailoredDir = path.join(__dirname, '..', 'data', 'tailored_resumes');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(tailoredDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '5mb' }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

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

function buildJobFilter(req) {
  const { q, work_mode, experience_level, source, min_relevance, salary_bucket, status } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR company LIKE ? OR description LIKE ? OR skills LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (work_mode) { where.push('work_mode = ?'); params.push(work_mode); }
  if (experience_level) { where.push('experience_level = ?'); params.push(experience_level); }
  if (source) { where.push('source = ?'); params.push(source); }
  if (min_relevance) { where.push('relevance_score >= ?'); params.push(Number(min_relevance)); }
  if (salary_bucket) {
    where.push('(salary_max IS NOT NULL AND salary_max >= ?)');
    params.push(Number(salary_bucket));
  }
  if (status === 'applied') {
    where.push("EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id AND a.status != 'PENDING')");
  }
  if (status === 'saved') {
    where.push('NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)');
  }
  return { where, params };
}

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
    const count = await importFrom(source, company, keyword || '');
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
    const results = await importAll(null, keyword || '');
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
  const result = run(
    `INSERT INTO applications (job_id, status, portal, resume_id, notes, applied_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [job_id, st, portal || null, resume_id || null, notes || null,
     st === 'PENDING' ? null : nowIso(), nowIso()]
  );
  log('info', `application #${result.lastInsertRowid} created for job ${job_id} status=${st}`);
  res.json(get('SELECT * FROM applications WHERE id = ?', [result.lastInsertRowid]));
}));

app.patch('/api/applications/:id', route((req, res) => {
  const existing = get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!existing) throw httpError(404, 'Application not found');
  const updates = [];
  const params = [];
  if (req.body.status !== undefined) {
    updates.push('status = ?');
    params.push(String(req.body.status));
    if (req.body.status !== 'PENDING' && !existing.applied_at) {
      updates.push('applied_at = ?');
      params.push(nowIso());
    }
  }
  if (req.body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(String(req.body.notes));
  }
  if (req.body.portal !== undefined) {
    updates.push('portal = ?');
    params.push(String(req.body.portal));
  }
  if (!updates.length) throw httpError(400, 'Nothing to update');
  params.push(req.params.id);
  run(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json(get('SELECT * FROM applications WHERE id = ?', [req.params.id]));
}));

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

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
  const headers = ['Job ID', 'Title', 'Company', 'Category', 'Location', 'Work Mode', 'Experience Level', 'Salary Min', 'Salary Max', 'Currency', 'URL', 'Source', 'Status', 'Portal', 'Applied At', 'Notes', 'Resume Filename'];
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[Object.keys(r)[headers.indexOf(h)]])).join(','));
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
    name: name || '',
    email: email || '',
    phone: phone || '',
    location: location || '',
    headline: headline || '',
    skills: Array.isArray(skills) ? skills : [],
    url: url || '',
    salary_target: salary_target || '',
    cover_letter: cover_letter || ''
  };
  setSetting('profile', profile);
  log('info', 'profile updated');
  res.json(profile);
}));

app.get('/api/settings', route((req, res) => {
  const keys = ['llmMode', 'llmHost', 'llmModel', 'discordWebhook'];
  const out = {};
  for (const k of keys) out[k] = getSetting(k, '');
  out.profile = getSetting('profile', {});
  res.json(out);
}));

app.put('/api/settings', route((req, res) => {
  const keys = ['llmMode', 'llmHost', 'llmModel', 'discordWebhook'];
  const body = req.body || {};
  for (const k of keys) {
    if (body[k] !== undefined) setSetting(k, String(body[k]));
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

const server = app.listen(PORT, () => {
  log('info', `server listening on http://localhost:${PORT}`);
  console.log(`JobHunt Coach running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  const detail = err.code === 'EADDRINUSE'
    ? `port ${PORT} is already in use — stop the other process or set PORT to a free port`
    : err.message;
  log('error', `server failed to start: ${detail}`);
  process.exit(1);
});

startEnricher();
