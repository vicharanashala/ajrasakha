import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4173);

const USERS = [
  {
    id: 'mod-1',
    email: 'moderator@annam.local',
    password: 'Moderator@123',
    name: 'Priya Moderator',
    role: 'moderator',
    reputation: 120,
  },
  {
    id: 'exp-1',
    email: 'expert@annam.local',
    password: 'Expert@123',
    name: 'Arun Expert',
    role: 'expert',
    reputation: 84,
  },
];

function seedQuestions() {
  return [
    {
      id: 'q-open',
      title: 'How should farmers treat rice blast in kharif?',
      status: 'open',
      assignee: null,
      answer: '',
      stuck: false,
    },
    {
      id: 'q-stuck',
      title: 'What seed rate is recommended for ragi in drought?',
      status: 'delayed',
      assignee: 'expert@annam.local',
      answer: '',
      stuck: true,
    },
    {
      id: 'q-review',
      title: 'Which subsidy applies to drip irrigation kits?',
      status: 'pae_submitted',
      assignee: 'expert@annam.local',
      answer: 'Apply under the state micro-irrigation mission with land records.',
      stuck: false,
    },
    {
      id: 'q-closed',
      title: 'How to store harvested onions without spoilage?',
      status: 'closed',
      assignee: 'expert@annam.local',
      answer: 'Use ventilated crates and avoid stacking wet bulbs.',
      stuck: false,
    },
  ];
}

let questions = seedQuestions();
let notifications = [
  {
    id: 'n-1',
    to: 'expert@annam.local',
    text: 'Stuck SLA: ragi seed-rate question is overdue.',
  },
];
let gdbEntries = 2;
const sessions = new Map();

function resetStore() {
  questions = seedQuestions();
  notifications = [
    {
      id: 'n-1',
      to: 'expert@annam.local',
      text: 'Stuck SLA: ragi seed-rate question is overdue.',
    },
  ];
  gdbEntries = 2;
  USERS[0].reputation = 120;
  USERS[1].reputation = 84;
  sessions.clear();
}

function json(res, code, body, extraHeaders = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = rest.join('=');
  }
  return out;
}

function userFromReq(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  const email = sid ? sessions.get(sid) : null;
  return USERS.find((u) => u.email === email) || null;
}

function counts() {
  const list = questions;
  return {
    open: list.filter((q) => q.status === 'open').length,
    delayed: list.filter((q) => q.status === 'delayed').length,
    inReview: list.filter((q) => q.status === 'in-review').length,
    ready: list.filter((q) => q.status === 'pae_submitted').length,
    closed: list.filter((q) => q.status === 'closed').length,
    stuck: list.filter((q) => q.stuck).length,
  };
}

function analytics() {
  return {
    gdbEntries,
    closed: questions.filter((q) => q.status === 'closed').length,
    allocations: questions.filter((q) => q.assignee).length,
    notifications: notifications.length,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/svg+xml',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/api/test/reset') {
    resetStore();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req);
    const user = USERS.find(
      (u) => u.email === body.email && u.password === body.password,
    );
    if (!user) {
      return json(res, 401, { error: 'Invalid email or password' });
    }
    const sid = `${user.id}-${Date.now()}`;
    sessions.set(sid, user.email);
    return json(
      res,
      200,
      { user: { email: user.email, name: user.name, role: user.role } },
      { 'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax` },
    );
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) sessions.delete(sid);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }

  const me = userFromReq(req);

  if (req.method === 'GET' && url.pathname === '/api/me') {
    if (!me) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, {
      email: me.email,
      name: me.name,
      role: me.role,
      reputation: me.reputation,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/questions') {
    if (!me) return json(res, 401, { error: 'Unauthorized' });
    const visible =
      me.role === 'expert'
        ? questions.filter((q) => q.assignee === me.email)
        : questions;
    return json(res, 200, { questions: visible, counts: counts() });
  }

  if (req.method === 'GET' && url.pathname === '/api/notifications') {
    if (!me) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, {
      notifications: notifications.filter((n) => n.to === me.email),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics') {
    if (!me) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, analytics());
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/questions\/[^/]+\/allocate$/)) {
    if (!me || me.role !== 'moderator') return json(res, 403, { error: 'Forbidden' });
    const id = url.pathname.split('/')[3];
    const q = questions.find((item) => item.id === id);
    if (!q) return json(res, 404, { error: 'Not found' });
    q.assignee = 'expert@annam.local';
    q.status = 'in-review';
    notifications.unshift({
      id: `n-${Date.now()}`,
      to: 'expert@annam.local',
      text: `You were assigned: ${q.title}`,
    });
    return json(res, 200, { question: q });
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/questions\/[^/]+\/answer$/)) {
    if (!me || me.role !== 'expert') return json(res, 403, { error: 'Forbidden' });
    const id = url.pathname.split('/')[3];
    const q = questions.find((item) => item.id === id);
    const body = await readBody(req);
    if (!q) return json(res, 404, { error: 'Not found' });
    q.answer = body.text || 'Draft answer from expert.';
    q.status = 'pae_submitted';
    q.stuck = false;
    notifications.unshift({
      id: `n-${Date.now()}`,
      to: 'moderator@annam.local',
      text: `Next reviewer: answer submitted for ${q.title}`,
    });
    return json(res, 200, { question: q });
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/questions\/[^/]+\/approve$/)) {
    if (!me || me.role !== 'moderator') return json(res, 403, { error: 'Forbidden' });
    const id = url.pathname.split('/')[3];
    const q = questions.find((item) => item.id === id);
    if (!q) return json(res, 404, { error: 'Not found' });
    q.status = 'closed';
    gdbEntries += 1;
    const expert = USERS.find((u) => u.email === q.assignee);
    if (expert) expert.reputation += 5;
    me.reputation += 2;
    return json(res, 200, { question: q, gdbEntries, analytics: analytics() });
  }

  let filePath = path.join(publicDir, url.pathname);
  if (url.pathname === '/' || url.pathname.endsWith('/')) {
    filePath = path.join(publicDir, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const index = path.join(publicDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(index).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ajrasakha-like desk running at http://127.0.0.1:${PORT}`);
});
