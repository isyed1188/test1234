import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = {
  profileRow: null,
  runCalls: [],
  runResult: { changes: 1, lastInsertRowid: 1 },
  runError: null,
  rows: []
};

vi.mock('../backend/database.js', () => ({
  get: (sql, params = []) => {
    if (sql.includes('FROM settings') && params[0] === 'profile') return db.profileRow;
    return undefined;
  },
  getSetting: (key, fallback = null) => {
    if (key !== 'profile' || !db.profileRow) return fallback;
    try {
      return JSON.parse(db.profileRow.value);
    } catch {
      return db.profileRow.value;
    }
  },
  all: () => db.rows,
  getSetting: (key, fallback = null) => {
    if (key !== 'profile') return fallback;
    if (!db.profileRow) return fallback;
    try {
      return JSON.parse(db.profileRow.value);
    } catch {
      return fallback;
    }
  },
  run: (sql, params = []) => {
    db.runCalls.push({ sql, params });
    if (db.runError) throw db.runError;
    return db.runResult;
  },
  log: () => {}
}));

const {
  detectWorkMode, detectExperience, parseSalary, relevanceScore,
  importFrom, importAll, knownSources
} = await import('../backend/scraper.js');

beforeEach(() => {
  db.profileRow = null;
  db.runCalls = [];
  db.runResult = { changes: 1, lastInsertRowid: 1 };
  db.runError = null;
  db.rows = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(payload) {
  return { ok: true, json: async () => payload, text: async () => JSON.stringify(payload) };
}

function savedJobs() {
  return db.runCalls
    .filter((c) => c.sql.includes('INSERT INTO jobs'))
    .map((c) => ({
      external_id: c.params[0],
      source: c.params[1],
      title: c.params[2],
      company: c.params[3],
      location: c.params[4],
      work_mode: c.params[5],
      experience_level: c.params[6],
      salary_min: c.params[7],
      salary_max: c.params[8],
      salary_currency: c.params[9],
      url: c.params[10],
      description: c.params[11],
      category: c.params[13],
      relevance_score: c.params[14]
    }));
}

describe('detectWorkMode', () => {
  it('detects remote from any of title, location or content', () => {
    expect(detectWorkMode('Remote Engineer', 'NYC', '')).toBe('Remote');
    expect(detectWorkMode('Engineer', 'Remote - US', '')).toBe('Remote');
    expect(detectWorkMode('Engineer', 'NYC', 'fully remote team')).toBe('Remote');
  });

  it('detects hybrid and defaults to onsite', () => {
    expect(detectWorkMode('Engineer', 'Hybrid - NYC', '')).toBe('Hybrid');
    expect(detectWorkMode('Engineer', 'NYC', 'in office')).toBe('Onsite');
  });

  it('prefers remote over hybrid when both appear', () => {
    expect(detectWorkMode('Engineer', 'Hybrid', 'remote friendly')).toBe('Remote');
  });

  it('does not treat negated remote wording as remote', () => {
    expect(detectWorkMode('Engineer', 'Austin, TX', 'This role is not remote.')).toBe('Onsite');
    expect(detectWorkMode('Engineer', 'Austin, TX', 'No remote option available.')).toBe('Onsite');
    expect(detectWorkMode('Engineer', 'Austin, TX', 'Onsite only, remote is not offered.')).toBe('Onsite');
  });
});

describe('parseSalary', () => {
  it('reads explicit ranges and k-suffixed figures', () => {
    expect(parseSalary('Base pay $120,000 - $150,000 per year')).toEqual({ min: 120000, max: 150000 });
    expect(parseSalary('Compensation: $180k')).toEqual({ min: 180000, max: 180000 });
  });

  it('rejects numbers that cannot be salaries', () => {
    expect(parseSalary('Founded 2020-2024, req id 118-220')).toBe(null);
    expect(parseSalary('')).toBe(null);
    expect(parseSalary(null)).toBe(null);
  });
});

describe('relevanceScore', () => {
  it('matches whole skill tokens only', () => {
    const profile = { skills: ['Go', 'SQL'] };
    expect(relevanceScore(profile, 'Backend Engineer', 'We use Go and SQL daily.')).toBe(100);
    expect(relevanceScore(profile, 'Backend Engineer', 'We use Google Cloud and SQLite.')).toBe(0);
  });

  it('scores zero without profile skills', () => {
    expect(relevanceScore({ skills: [] }, 'Anything', 'Anything')).toBe(0);
  });
});

describe('detectExperience', () => {
  it('ranks seniority keywords', () => {
    expect(detectExperience('Director of Engineering', '')).toBe('Director');
    expect(detectExperience('VP, Platform', '')).toBe('Director');
    expect(detectExperience('Principal Engineer', '')).toBe('Principal');
    expect(detectExperience('Staff Engineer', '')).toBe('Staff');
    expect(detectExperience('Sr. Engineer', '')).toBe('Senior');
    expect(detectExperience('Engineering Manager', '')).toBe('Lead');
    expect(detectExperience('Junior Engineer', '')).toBe('Junior');
  });

  it('falls back to not specified', () => {
    expect(detectExperience('Software Engineer', 'we build things')).toBe('Not specified');
  });

  it('reads keywords from the content too', () => {
    expect(detectExperience('Engineer', 'this is a staff level role')).toBe('Staff');
  });

  it('prefers the most senior match', () => {
    expect(detectExperience('Senior Director', '')).toBe('Director');
  });
});

describe('knownSources', () => {
  it('exposes greenhouse, lever and workday boards', () => {
    const sources = knownSources();
    expect(sources.greenhouse).toContain('stripe');
    expect(sources.lever).toContain('plaid');
    expect(sources.workday).toContain('Nike');
  });
});

describe('importFrom - greenhouse', () => {
  it('maps and saves postings', async () => {
    stubFetch(async () =>
      jsonResponse({
        jobs: [
          {
            id: 1,
            title: 'Remote Senior Engineer',
            location: { name: 'Remote - US' },
            absolute_url: 'https://gh.test/1',
            departments: [{ name: 'Engineering' }]
          }
        ]
      })
    );
    await expect(importFrom('Greenhouse', 'stripe')).resolves.toBe(1);
    expect(savedJobs()[0]).toMatchObject({
      external_id: 'gh-stripe-1',
      source: 'Greenhouse',
      company: 'stripe',
      work_mode: 'Remote',
      experience_level: 'Senior',
      url: 'https://gh.test/1',
      category: 'Engineering',
      relevance_score: 0
    });
  });

  it('filters postings by keyword and tolerates missing fields', async () => {
    stubFetch(async () =>
      jsonResponse({ jobs: [{ id: 1, title: 'Designer' }, { id: 2, title: 'Data Engineer' }] })
    );
    await expect(importFrom('greenhouse', 'stripe', 'engineer')).resolves.toBe(1);
    expect(savedJobs()).toHaveLength(1);
    expect(savedJobs()[0]).toMatchObject({ external_id: 'gh-stripe-2', location: '', url: '', category: '' });
  });

  it('scores relevance against the stored profile skills', async () => {
    db.profileRow = { value: JSON.stringify({ skills: ['Python', 'Go', 'Rust', 'SQL'] }) };
    stubFetch(async () => jsonResponse({ jobs: [{ id: 3, title: 'Python and SQL Engineer' }] }));
    await importFrom('greenhouse', 'stripe');
    expect(savedJobs()[0].relevance_score).toBe(50);
  });

  it('ignores an unparseable stored profile', async () => {
    db.profileRow = { value: 'not json' };
    stubFetch(async () => jsonResponse({ jobs: [{ id: 4, title: 'Engineer' }] }));
    await importFrom('greenhouse', 'stripe');
    expect(savedJobs()[0].relevance_score).toBe(0);
  });

  it('counts nothing when the insert fails', async () => {
    db.runError = new Error('db down');
    stubFetch(async () => jsonResponse({ jobs: [{ id: 5, title: 'Engineer' }] }));
    await expect(importFrom('greenhouse', 'stripe')).resolves.toBe(0);
  });

  it('propagates http errors', async () => {
    stubFetch(async () => ({ ok: false, status: 404 }));
    await expect(importFrom('greenhouse', 'nope')).rejects.toThrow('HTTP 404');
  });
});

describe('importFrom - lever', () => {
  it('strips html from descriptions and maps salary range', async () => {
    stubFetch(async () =>
      jsonResponse([
        {
          id: 'abc',
          text: 'Hybrid Staff Engineer',
          description: '<p>Build&nbsp;things &amp; ship</p>',
          categories: { allLocations: ['NYC', 'SF'], team: ' Core ' },
          salaryRange: { min: 100000, max: 200000, currency: 'EUR' },
          hostedUrl: 'https://lever.test/abc'
        }
      ])
    );
    await expect(importFrom('Lever', 'plaid')).resolves.toBe(1);
    expect(savedJobs()[0]).toMatchObject({
      external_id: 'lv-plaid-abc',
      source: 'Lever',
      location: 'NYC, SF',
      work_mode: 'Hybrid',
      experience_level: 'Staff',
      salary_min: 100000,
      salary_max: 200000,
      salary_currency: 'EUR',
      description: 'Build things & ship',
      category: 'Core'
    });
  });

  it('matches the keyword against the description as well', async () => {
    stubFetch(async () =>
      jsonResponse([
        { id: 'a', text: 'Designer', descriptionPlain: 'kubernetes experience' },
        { id: 'b', text: 'Designer', descriptionPlain: 'figma only' }
      ])
    );
    await expect(importFrom('lever', 'plaid', 'kubernetes')).resolves.toBe(1);
    expect(savedJobs()[0].external_id).toBe('lv-plaid-a');
  });

  it('defaults salary and currency when no range is given', async () => {
    stubFetch(async () => jsonResponse([{ id: 'c', title: 'Engineer' }]));
    await importFrom('lever', 'plaid');
    expect(savedJobs()[0]).toMatchObject({ salary_min: null, salary_max: null, salary_currency: 'USD' });
  });

  it('treats a non-array payload as no postings', async () => {
    stubFetch(async () => jsonResponse({ postings: [] }));
    await expect(importFrom('lever', 'plaid')).resolves.toBe(0);
  });
});

describe('importFrom - workday', () => {
  it('paginates and derives ids from the external path', async () => {
    const pages = [
      {
        total: 2,
        jobPostings: [{ title: 'Senior Engineer', locationsText: 'Beaverton', externalPath: '/job/Engineer_R-12345' }]
      },
      { total: 2, jobPostings: [{ title: 'Analyst', externalPath: '/job/Analyst' }] }
    ];
    let call = 0;
    stubFetch(async () => jsonResponse(pages[call++]));
    await expect(importFrom('Fortune 500', 'nike')).resolves.toBe(2);
    const jobs = savedJobs();
    expect(jobs[0]).toMatchObject({
      external_id: 'wd-nike-R-12345',
      source: 'Fortune 500',
      company: 'Nike',
      location: 'Beaverton',
      experience_level: 'Senior',
      url: 'https://nike.wd1.myworkdayjobs.com/en-US/nke/job/Engineer_R-12345'
    });
    expect(jobs[1].external_id).toBe(`wd-nike-${encodeURIComponent('/job/Analyst')}`);
  });

  it('stops when a page returns no postings', async () => {
    stubFetch(async () => jsonResponse({ total: 100, jobPostings: [] }));
    await expect(importFrom('workday', 'nike')).resolves.toBe(0);
  });

  it('rejects unknown fortune 500 boards', async () => {
    await expect(importFrom('fortune', 'not-a-company')).rejects.toThrow(
      'Unknown Fortune 500 board: not-a-company'
    );
  });
});

describe('importFrom - unknown source', () => {
  it('rejects', async () => {
    await expect(importFrom('monster', 'x')).rejects.toThrow('Unknown source: monster');
  });
});

describe('importAll', () => {
  it('imports the requested boards and records per-board counts', async () => {
    stubFetch(async (url) => {
      if (String(url).includes('greenhouse')) return jsonResponse({ jobs: [{ id: 1, title: 'Engineer' }] });
      return jsonResponse([{ id: 'a', text: 'Engineer' }]);
    });
    const results = await importAll({ greenhouse: ['stripe'], lever: ['plaid'], workday: [] });
    expect(results).toEqual({ greenhouse: { stripe: 1 }, lever: { plaid: 1 }, workday: {} });
  });

  it('captures per-board errors instead of failing the whole run', async () => {
    stubFetch(async () => ({ ok: false, status: 500 }));
    const results = await importAll({ greenhouse: ['stripe'], lever: [], workday: ['bogus'] });
    expect(results.greenhouse.stripe).toContain('HTTP 500');
    expect(results.workday.bogus).toBe('error: unknown board');
  });

  it('falls back to the built-in lists for non-array selections', async () => {
    stubFetch(async () => jsonResponse({ jobs: [] }));
    const results = await importAll({ greenhouse: ['stripe'], lever: 'nope', workday: [] });
    expect(Object.keys(results.lever)).toEqual(knownSources().lever);
  });
});
