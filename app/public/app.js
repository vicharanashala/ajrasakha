const app = document.getElementById('app');
let view = 'login';
let me = null;
let errorText = '';
let questions = [];
let counts = {};
let notes = [];
let analyticsData = {};

const protectedPrefixes = [
  '/home',
  '/notifications',
  '/history',
  '/flags-reported',
  '/audit',
  '/coordinator',
  '/pae-expert',
  '/profile',
  '/chatbot',
  '/whatsapp-history',
  '/user/',
  '/user-history/',
];

function path() {
  return window.location.pathname;
}

function isProtected(p) {
  return protectedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(prefix));
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.ok;
    throw err;
  }
  return data;
}

async function go(to) {
  history.pushState({}, '', to);
  if (me) await hydrate();
  render();
}

window.addEventListener('popstate', render);

function field(id, label, type, placeholder, extra = '') {
  return `<div class="grid">
    <label for="${id}">${label}</label>
    <div class="relative">
      <input data-slot="input" id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" value="" ${extra} />
      ${type === 'password' ? '<button type="button" class="toggle-pw" data-for="' + id + '"></button>' : ''}
    </div>
  </div>`;
}

function authCard(inner, title) {
  return `<div class="auth-shell">
    <div data-slot="card">
      <div data-slot="card-header">
        <img alt="Annam Logo" class="logo" src="/logo.png" />
        <div data-slot="card-title">${title}</div>
      </div>
      <div data-slot="card-content">${inner}</div>
    </div>
  </div>`;
}

function bindPasswordToggles() {
  for (const btn of document.querySelectorAll('.toggle-pw')) {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-for'));
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }
}

function renderAuth() {
  if (view === 'reset') {
    app.innerHTML = authCard(
      `<p>Enter your email address and we'll send you a link to reset your password.</p>
       <form>
         ${field('email', 'Email Address', 'email', 'user@example.com')}
         <button class="primary" type="submit" id="send-reset">Send Reset Link</button>
         <div class="center"><button type="button" class="link" id="back-login">Back to Login</button></div>
       </form>`,
      'Reset Password',
    );
    document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('back-login').addEventListener('click', () => {
      view = 'login';
      render();
    });
    return;
  }

  if (view === 'signup') {
    app.innerHTML = authCard(
      `<form>
         ${field('fullName', 'Full Name', 'text', 'Enter your full name')}
         ${field('email', 'Email Address', 'email', 'user@example.com')}
         ${field('password', 'Password', 'password', 'Enter your password')}
         ${field('confirmPassword', 'Confirm Password', 'password', 'Confirm your password')}
         <button class="primary" type="submit">Create Account</button>
         <p class="center">Already have an account?<button type="button" class="link" aria-label="Switch to login" id="to-login">Sign in</button></p>
       </form>`,
      'Join Annam',
    );
    document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('to-login').addEventListener('click', () => {
      view = 'login';
      render();
    });
    bindPasswordToggles();
    return;
  }

  app.innerHTML = authCard(
    `<form>
       ${field('email', 'Email Address', 'email', 'user@example.com')}
       ${field('password', 'Password', 'password', 'Enter your password')}
       <div class="row-end"><button type="button" class="link" id="forgot">Forgot password?</button></div>
       ${errorText ? `<p class="error">${errorText}</p>` : ''}
       <button class="primary" type="submit">Sign In</button>
       <p class="center">New to Annam?<button type="button" class="link" aria-label="Switch to signup" id="to-signup">Sign up</button></p>
     </form>`,
    'Welcome Back',
  );
  document.getElementById('forgot').addEventListener('click', () => {
    view = 'reset';
    render();
  });
  document.getElementById('to-signup').addEventListener('click', () => {
    view = 'signup';
    render();
  });
  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email');
    if (!email.validity.valid) return;
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.value,
          password: document.getElementById('password').value,
        }),
      });
      errorText = '';
      history.replaceState({}, '', '/home/');
      await hydrate();
      render();
    } catch (err) {
      errorText = err.message || 'Invalid email or password';
      render();
    }
  });
  bindPasswordToggles();
}

function nav() {
  return `<nav class="nav">
    <a href="/home/">Home</a>
    <a href="/notifications/">Notifications</a>
    <a href="/history/">History</a>
    <a href="/flags-reported/">Flags</a>
    <a href="/audit/">Analytics</a>
    <a href="/profile/">Profile</a>
    <a href="/pae-expert/">PAE Expert</a>
    <a href="/coordinator/">Coordinator</a>
    <a href="/chatbot/">Chatbot</a>
    <a href="/whatsapp-history">WhatsApp</a>
    <span>${me.name} (${me.role})</span>
  </nav>`;
}

function statusBadge(q) {
  const extra = q.stuck ? ' stuck' : '';
  const label = q.stuck ? 'stuck delayed' : q.status;
  return `<span class="badge ${q.status}${extra}">${label}</span>`;
}

function renderShell(body) {
  app.innerHTML = `${nav()}<div class="page">${body}</div>`;
  for (const a of document.querySelectorAll('.nav a')) {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await go(a.getAttribute('href'));
    });
  }
}

function queueCounts() {
  return `<div class="counts">
    <div class="count">Open <strong>${counts.open ?? 0}</strong></div>
    <div class="count">Delayed <strong>${counts.delayed ?? 0}</strong></div>
    <div class="count">In-review <strong>${counts.inReview ?? 0}</strong></div>
    <div class="count">Ready <strong>${counts.ready ?? 0}</strong></div>
    <div class="count">Closed <strong>${counts.closed ?? 0}</strong></div>
    <div class="count">Stuck <strong>${counts.stuck ?? 0}</strong></div>
  </div>`;
}

function renderHome() {
  const rows = questions
    .map((q) => {
      const allocate =
        me.role === 'moderator' && q.status === 'open'
          ? `<button data-allocate="${q.id}">Allocate expert</button>`
          : '';
      const approve =
        me.role === 'moderator' && q.status === 'pae_submitted'
          ? `<button data-approve="${q.id}">Approve final answer</button>`
          : '';
      const answer =
        me.role === 'expert' && q.status !== 'closed'
          ? `<button data-open="${q.id}">Open question</button>`
          : '';
      return `<tr>
        <td>${q.title}</td>
        <td>${statusBadge(q)}</td>
        <td>${q.assignee || '—'}</td>
        <td>${allocate}${approve}${answer}</td>
      </tr>`;
    })
    .join('');

  const composer = me.role === 'expert'
    ? `<h3>Assigned questions</h3>
       <label for="answer-text">Answer</label>
       <textarea id="answer-text" placeholder="Write the farmer-facing answer"></textarea>
       <p><button class="primary" style="width:auto" id="submit-answer">Submit answer</button></p>`
    : '';

  renderShell(`
    <h1>Question queue</h1>
    ${queueCounts()}
    <table>
      <thead><tr><th>Question</th><th>Status</th><th>Expert</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No questions</td></tr>'}</tbody>
    </table>
    ${composer}
  `);

  for (const btn of document.querySelectorAll('[data-allocate]')) {
    btn.addEventListener('click', async () => {
      await api(`/api/questions/${btn.getAttribute('data-allocate')}/allocate`, { method: 'POST' });
      await hydrate();
      render();
    });
  }
  for (const btn of document.querySelectorAll('[data-approve]')) {
    btn.addEventListener('click', async () => {
      await api(`/api/questions/${btn.getAttribute('data-approve')}/approve`, { method: 'POST' });
      await hydrate();
      render();
    });
  }
  const submit = document.getElementById('submit-answer');
  if (submit) {
    submit.addEventListener('click', async () => {
      const assigned = questions.find((q) => q.status === 'in-review') || questions[0];
      if (!assigned) return;
      await api(`/api/questions/${assigned.id}/answer`, {
        method: 'POST',
        body: JSON.stringify({ text: document.getElementById('answer-text').value }),
      });
      await hydrate();
      render();
    });
  }
}

function renderNotifications() {
  const items = notes.map((n) => `<li>${n.text}</li>`).join('') || '<li>No notifications</li>';
  renderShell(`<h1>Notifications</h1><ul>${items}</ul>`);
}

function renderProfile() {
  renderShell(`
    <h1>Profile</h1>
    <p>${me.name}</p>
    <p>Role: ${me.role}</p>
    <p>Reputation score <strong id="reputation-score">${me.reputation}</strong></p>
  `);
}

function renderAnalytics() {
  renderShell(`
    <h1>Analytics dashboard</h1>
    <div class="counts">
      <div class="count">GDB entries <strong>${analyticsData.gdbEntries ?? 0}</strong></div>
      <div class="count">Closed <strong>${analyticsData.closed ?? 0}</strong></div>
      <div class="count">Allocations <strong>${analyticsData.allocations ?? 0}</strong></div>
    </div>
  `);
}

function renderSimple(title) {
  renderShell(`<h1>${title}</h1><p>Section loaded for ${me.role}.</p>`);
}

async function hydrate() {
  try {
    me = await api('/api/me');
    const q = await api('/api/questions');
    questions = q.questions;
    counts = q.counts;
    notes = (await api('/api/notifications')).notifications;
    analyticsData = await api('/api/analytics');
  } catch {
    me = null;
  }
}

async function render() {
  const p = path();
  if (!me && isProtected(p)) {
    if (p !== '/auth' && p !== '/auth/') {
      history.replaceState({}, '', '/auth');
    }
    renderAuth();
    return;
  }
  if (!me && (p === '/' || p === '/auth' || p === '/auth/')) {
    if (p === '/') history.replaceState({}, '', '/auth');
    renderAuth();
    return;
  }
  if (me && (p === '/' || p === '/auth' || p === '/auth/')) {
    history.replaceState({}, '', '/home/');
  }
  const current = path();
  if (current.startsWith('/home')) return renderHome();
  if (current.startsWith('/notifications')) return renderNotifications();
  if (current.startsWith('/profile')) return renderProfile();
  if (current.startsWith('/audit')) return renderAnalytics();
  if (current.startsWith('/history')) return renderSimple('History');
  if (current.startsWith('/flags-reported')) return renderSimple('Flags reported');
  if (current.startsWith('/pae-expert')) return renderSimple('PAE Expert');
  if (current.startsWith('/coordinator')) return renderSimple('Coordinator');
  if (current.startsWith('/chatbot')) return renderSimple('Chatbot');
  if (current.startsWith('/whatsapp-history')) return renderSimple('WhatsApp history');
  if (current.startsWith('/user')) return renderSimple('User');
  renderHome();
}

hydrate().then(render);
