import { score } from './scoring.js';
import { matchRoles, reachByDay } from './match.js';
import { buildReportData, encodeReport, renderReport } from './report.js';

const LANG = document.documentElement.lang || 'en';
const PER_PAGE = 6;

const C = {};           // content
const S = {              // state (in memory only)
  first: '', last: '', email: '',
  answers: [], page: 0,
  readiness: {}, audiences: [], availability: 'flex',
  about: { skills: '', serveWith: [], barriers: [], rhythm: '', faith: '' },
  result: null, matches: [], chosen: null, startedAt: null,
  reportData: null, reportUrl: '', remindAt: ''
};

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const t = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function loadContent() {
  const names = ['ui', 'items', 'archetypes', 'audiences', 'availability', 'roles', 'teams', 'about'];
  const data = await Promise.all(names.map(n => fetch(`content/${LANG}/${n}.json`).then(r => r.json())));
  names.forEach((n, i) => { C[n] = data[i]; });
  C.ITEMS = C.items.items;
  C.ORDER = C.archetypes.order;
  C.A = C.archetypes.archetypes;
  S.answers = new Array(C.ITEMS.length).fill(null);
}

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`#screen-${name}`).classList.add('active');
  window.scrollTo({ top: 0 });
  const rep = $('#report'); if (name === 'report' && rep && rep.__thriveFit) requestAnimationFrame(rep.__thriveFit);
}

/* ---------------- welcome ---------------- */
function renderWelcome() {
  const u = C.ui.welcome;
  $('#screen-welcome').innerHTML = `
    <div class="wrap">
      <div class="eyebrow">${esc(u.eyebrow)}</div>
      <h1>${esc(u.title)}</h1>
      <p class="lead">${esc(u.lead)}</p>
      <form id="welcome-form" class="form" novalidate>
        <div class="row2">
          <label>${esc(u.firstName)}<input name="first" autocomplete="given-name" required></label>
          <label>${esc(u.lastName)}<input name="last" autocomplete="family-name" required></label>
        </div>
        <label>${esc(u.email)}<input name="email" type="email" autocomplete="email" required></label>
        <p class="fine">${esc(u.consent)}</p>
        <button class="btn primary" type="submit">${esc(u.start)}</button>
        <p class="fine">${esc(u.note)}</p>
      </form>
    </div>`;
  $('#welcome-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (!f.reportValidity()) return;
    S.first = f.first.value.trim(); S.last = f.last.value.trim(); S.email = f.email.value.trim();
    S.startedAt = Date.now();
    S.page = 0;
    renderQuestions();
    show('questions');
  });
}

/* ---------------- questions ---------------- */
function totalPages() { return Math.ceil(C.ITEMS.length / PER_PAGE); }

function renderQuestions() {
  const u = C.ui.questions;
  const start = S.page * PER_PAGE;
  const slice = C.ITEMS.slice(start, start + PER_PAGE);
  const answered = S.answers.filter(a => a != null).length;
  const root = $('#screen-questions');
  root.innerHTML = `
    <div class="progress"><div class="bar"><div class="fill" style="width:${(answered / C.ITEMS.length) * 100}%"></div></div>
      <div class="count">${esc(t(u.progress, { done: answered, total: C.ITEMS.length }))}</div></div>
    <div class="wrap">
      <div class="prompt">${esc(u.prompt)}</div>
      <div id="qlist"></div>
      <div class="btnrow">
        <button class="btn quiet" id="back" ${S.page === 0 ? 'style="visibility:hidden"' : ''}>${esc(u.back)}</button>
        <button class="btn primary" id="next" disabled>${esc(u.next)}</button>
      </div>
    </div>`;
  const list = $('#qlist');
  slice.forEach((item, i) => {
    const idx = start + i;
    const q = el('div', 'q' + (S.answers[idx] != null ? ' answered' : ''));
    q.innerHTML = `<div class="q-text">${esc(item.t)}</div>
      <div class="scale" role="radiogroup" aria-label="${esc(item.t)}">
        <span class="end">${esc(u.left)}</span>
        <div class="dots">${[1, 2, 3, 4, 5].map(v => `<button type="button" class="dot" role="radio" aria-checked="${S.answers[idx] === v}" aria-label="${esc(u.scale[v - 1])}" data-v="${v}"></button>`).join('')}</div>
        <span class="end right">${esc(u.right)}</span>
      </div>`;
    q.querySelectorAll('.dot').forEach(d => d.addEventListener('click', () => {
      S.answers[idx] = Number(d.dataset.v);
      q.querySelectorAll('.dot').forEach(x => x.setAttribute('aria-checked', 'false'));
      d.setAttribute('aria-checked', 'true');
      q.classList.add('answered');
      refreshNext();
      const done = S.answers.filter(a => a != null).length;
      $('.progress .fill').style.width = (done / C.ITEMS.length) * 100 + '%';
      $('.progress .count').textContent = t(u.progress, { done, total: C.ITEMS.length });
    }));
    list.appendChild(q);
  });
  function refreshNext() {
    const complete = S.answers.slice(start, start + slice.length).every(a => a != null);
    $('#next').disabled = !complete;
  }
  refreshNext();
  $('#back').addEventListener('click', () => { S.page--; renderQuestions(); });
  $('#next').addEventListener('click', () => {
    if (S.page < totalPages() - 1) { S.page++; renderQuestions(); }
    else { renderReadiness(); show('readiness'); }
  });
}

/* ---------------- readiness ---------------- */
function renderReadiness() {
  const u = C.ui.readiness;
  const pre = score(C.ITEMS, C.ORDER, S.answers, {});
  const targets = pre.readinessTargets;
  const root = $('#screen-readiness');
  root.innerHTML = `<div class="wrap">
    <div class="eyebrow">${esc(u.eyebrow)}</div>
    <h2>${esc(u.title)}</h2>
    <div id="rlist"></div>
    <div class="btnrow"><button class="btn primary" id="rnext" disabled>${esc(C.ui.questions.next)}</button></div>
  </div>`;
  const list = $('#rlist');
  targets.forEach(key => {
    const a = C.A[key];
    const card = el('div', 'rcard');
    card.innerHTML = `<div class="rname">${esc(a.name)}</div><div class="ract">${esc(a.activity)}</div>
      <div class="ropts">${u.options.map(o => `<button type="button" class="chip" data-k="${o.key}">${esc(o.label)}</button>`).join('')}</div>`;
    card.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
      S.readiness[key] = ch.dataset.k;
      card.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      ch.classList.add('on');
      $('#rnext').disabled = targets.some(k => !S.readiness[k]);
    }));
    list.appendChild(card);
  });
  $('#rnext').addEventListener('click', () => { renderAudience(); show('audience'); });
}

/* ---------------- audience ---------------- */
function renderAudience() {
  const u = C.ui.audience;
  const root = $('#screen-audience');
  root.innerHTML = `<div class="wrap">
    <div class="eyebrow">${esc(u.eyebrow)}</div>
    <h2>${esc(u.title)}</h2>
    <p class="note">${esc(u.note)}</p>
    <div class="chips" id="achips"></div>
    <div class="btnrow">
      <button class="btn quiet" id="askip">${esc(u.skip)}</button>
      <button class="btn primary" id="anext">${esc(C.ui.questions.next)}</button>
    </div>
  </div>`;
  const box = $('#achips');
  C.audiences.audiences.forEach(a => {
    const b = el('button', 'chip' + (S.audiences.includes(a.key) ? ' on' : ''), esc(a.label));
    b.type = 'button';
    b.addEventListener('click', () => {
      const i = S.audiences.indexOf(a.key);
      if (i >= 0) { S.audiences.splice(i, 1); b.classList.remove('on'); }
      else if (S.audiences.length < C.audiences.max) { S.audiences.push(a.key); b.classList.add('on'); }
    });
    box.appendChild(b);
  });
  $('#askip').addEventListener('click', () => { S.audiences = []; renderAvailability(); show('availability'); });
  $('#anext').addEventListener('click', () => { renderAvailability(); show('availability'); });
}

/* ---------------- availability ---------------- */
function renderAvailability() {
  const u = C.ui.availability;
  const root = $('#screen-availability');
  root.innerHTML = `<div class="wrap">
    <div class="eyebrow">${esc(u.eyebrow)}</div>
    <h2>${esc(u.title)}</h2>
    <p class="note">${esc(u.note)}</p>
    <div class="stack" id="avail"></div>
  </div>`;
  const box = $('#avail');
  C.availability.options.forEach(o => {
    const b = el('button', 'option', esc(o.label));
    b.type = 'button';
    b.addEventListener('click', () => { S.availability = o.key; renderAbout(); show('about'); });
    box.appendChild(b);
  });
}

/* ---------------- about you (optional) ---------------- */
function renderAbout() {
  const u = C.ui.about, A = C.about, ab = S.about;
  const chips = (list, selected, multi, onPick) => list.map(o =>
    `<button type="button" class="chip${selected.includes(o.key) ? ' on' : ''}" data-k="${o.key}">${esc(o.label)}</button>`).join('');
  $('#screen-about').innerHTML = `<div class="wrap">
    <div class="eyebrow">${esc(u.eyebrow)}</div>
    <h2>${esc(u.title)}</h2>
    <p class="note">${esc(u.note)}</p>
    <div class="about-block"><label class="alabel" for="skills">${esc(u.skillsLabel)}</label>
      <textarea id="skills" rows="2" placeholder="${esc(u.skillsPlaceholder)}">${esc(ab.skills)}</textarea></div>
    <div class="about-block"><div class="alabel">${esc(u.serveWithLabel)}</div><div class="chips" data-group="serveWith">${chips(A.serveWith, ab.serveWith)}</div></div>
    <div class="about-block"><div class="alabel">${esc(u.barriersLabel)}</div><div class="chips" data-group="barriers">${chips(A.barriers, ab.barriers)}</div></div>
    <div class="about-block"><div class="alabel">${esc(u.rhythmLabel)}</div><div class="chips" data-group="rhythm">${chips(A.rhythm, ab.rhythm ? [ab.rhythm] : [])}</div></div>
    <div class="about-block"><div class="alabel">${esc(u.faithLabel)}</div><p class="fine">${esc(u.faithNote)}</p><div class="chips" data-group="faith">${chips(A.faith, ab.faith ? [ab.faith] : [])}</div></div>
    <div class="btnrow">
      <button class="btn quiet" id="abskip">${esc(u.skip)}</button>
      <button class="btn primary" id="abnext">${esc(u.next)}</button>
    </div>
  </div>`;
  const multi = { serveWith: true, barriers: true, rhythm: false, faith: false };
  document.querySelectorAll('#screen-about .chips').forEach(group => {
    const g = group.dataset.group;
    group.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
      const k = ch.dataset.k;
      if (multi[g]) {
        const arr = S.about[g];
        const i = arr.indexOf(k);
        if (i >= 0) { arr.splice(i, 1); ch.classList.remove('on'); }
        else {
          if (g === 'barriers' && k === 'none') { arr.length = 0; group.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); }
          if (g === 'barriers' && k !== 'none') { const ni = arr.indexOf('none'); if (ni >= 0) { arr.splice(ni, 1); group.querySelector('.chip[data-k="none"]').classList.remove('on'); } }
          arr.push(k); ch.classList.add('on');
        }
      } else {
        S.about[g] = S.about[g] === k ? '' : k;
        group.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
        if (S.about[g]) ch.classList.add('on');
      }
    }));
  });
  $('#abskip').addEventListener('click', () => { S.about = { skills: '', serveWith: [], barriers: [], rhythm: '', faith: '' }; finish(); });
  $('#abnext').addEventListener('click', () => { S.about.skills = $('#skills').value.trim().slice(0, 300); finish(); });
}

/* ---------------- report ---------------- */
function labelOf(list, key) { const o = list.find(x => x.key === key); return o ? o.label : key; }

function finish() {
  S.result = score(C.ITEMS, C.ORDER, S.answers, S.readiness);
  S.matches = matchRoles({
    fruitful: S.result.fruitful, audiences: S.audiences, availability: S.availability,
    roles: C.roles.roles, teams: C.teams.teams, about: S.about
  });
  S.reportData = buildReportData({
    first: S.first, last: S.last, email: S.email, result: S.result, matches: S.matches,
    audiencesLabels: S.audiences.map(k => labelOf(C.audiences.audiences, k)),
    availabilityLabel: labelOf(C.availability.options, S.availability),
    aboutLabels: {
      skills: S.about.skills,
      serveWith: S.about.serveWith.map(k => labelOf(C.about.serveWith, k)),
      rhythm: S.about.rhythm ? labelOf(C.about.rhythm, S.about.rhythm) : '',
      faith: S.about.faith ? labelOf(C.about.faith, S.about.faith) : ''
    },
    archetypes: C.A, order: C.ORDER, ui: C.ui, lang: LANG,
    links: { serve: 'loftcity.church/connect/serve', coffee: 'calendly.com/samchacko', retake: location.host || 'thrive.loftcity.church' }
  });
  S.reportUrl = location.origin + '/report.html?d=' + encodeReport(S.reportData);
  renderReportScreen();
  show('report');
}

function renderReportScreen() {
  const u = C.ui.report;
  const root = $('#screen-report');
  root.innerHTML = `<div class="wrap">
    <div class="r-actions no-print">
      <button class="btn primary small" id="emailrep">${esc(u.emailBtn)}</button>
      <button class="btn quiet small" id="printrep">${esc(u.printBtn)}</button>
    </div>
    <div class="r-status" id="repstatus"></div>
    <div id="report" class="report"></div>
    <div class="btnrow no-print"><button class="btn primary" id="todoors">${esc(C.ui.decide.title)}</button></div>
  </div>`;
  renderReport($('#report'), S.reportData, { ui: C.ui, archetypes: C.archetypes });
  $('#printrep').addEventListener('click', () => window.print());
  $('#emailrep').addEventListener('click', async () => {
    const st = $('#repstatus'); st.textContent = u.emailSending;
    const ok = await post({ action: 'emailReport' });
    st.textContent = ok ? t(u.emailSent, { email: S.email }) : u.emailFail;
  });
  $('#todoors').addEventListener('click', () => { renderDoors(); show('decide'); });
}

/* ---------------- the four doors ---------------- */
function renderDoors() {
  const u = C.ui.decide, isRest = S.availability === 'rest';
  const order = isRest ? ['remind', 'keep', 'talk', 'try'] : ['try', 'talk', 'remind', 'keep'];
  $('#screen-decide').innerHTML = `<div class="wrap">
    <h2>${esc(u.title)}</h2>
    <p class="note">${esc(u.note)}</p>
    ${isRest ? `<div class="season">${esc(u.restFirst)}</div>` : ''}
    <div class="doors">${order.map(k => `<button class="door" data-k="${k}"><div class="door-t">${esc(u.doors[k].t)}</div><div class="door-s">${esc(u.doors[k].s)}</div></button>`).join('')}</div>
    <div class="btnrow"><button class="btn quiet" id="doorsback">${esc(u.back)}</button></div>
  </div>`;
  $('#doorsback').addEventListener('click', () => show('report'));
  document.querySelectorAll('#screen-decide .door').forEach(d => d.addEventListener('click', () => {
    const k = d.dataset.k;
    if (k === 'try') { renderTry(); show('try'); }
    else if (k === 'talk') { renderTalk(); show('talk'); }
    else if (k === 'remind') { renderRemind(); show('remind'); }
    else { S.chosen = null; submit('keep'); }
  }));
}

/* ---- door 1: try a role ---- */
function renderTry() {
  const u = C.ui.tryrole, ur = C.ui.report;
  const cards = S.matches.map((m, i) => {
    const time = m.role.time || t(ur.timeUnknown, { leader: m.team.leader });
    return `<div class="role">
      <div class="role-top"><div class="role-name">${esc(m.role.name)}</div><div class="role-team">${esc(m.team.name)}</div></div>
      <div class="role-what">${esc(m.role.what)}</div>
      <div class="role-meta"><span>${esc(m.role.when)}</span><span>${esc(time)}</span></div>
      <button class="btn primary small" data-i="${i}">${esc(u.tryIt)}</button></div>`;
  }).join('');
  $('#screen-try').innerHTML = `<div class="wrap"><h2>${esc(u.title)}</h2><p class="note">${esc(u.note)}</p>
    <div class="roles">${cards}</div>
    <div class="btnrow"><button class="btn quiet" id="tryback">${esc(C.ui.decide.back)}</button></div></div>`;
  $('#tryback').addEventListener('click', () => show('decide'));
  document.querySelectorAll('#screen-try .role .btn').forEach(b => b.addEventListener('click', () => {
    S.chosen = S.matches[Number(b.dataset.i)]; submit('try');
  }));
}

/* ---- door 2: talk with someone ---- */
function renderTalk() {
  const u = C.ui.talk;
  const teams = Object.entries(C.teams.teams).filter(([k]) => k !== 'general');
  $('#screen-talk').innerHTML = `<div class="wrap"><h2>${esc(u.title)}</h2><p class="note">${esc(u.note)}</p>
    <div class="teamlist">${teams.map(([k, tm]) => `<button class="option" data-k="${k}">${esc(tm.name)}<span class="muted"> · ${esc(tm.leader)}</span></button>`).join('')}
      <button class="option" id="unsure"><strong>${esc(u.unsure)}</strong></button></div>
    <div class="btnrow"><button class="btn quiet" id="talkback">${esc(C.ui.decide.back)}</button></div></div>`;
  $('#talkback').addEventListener('click', () => show('decide'));
  document.querySelectorAll('#screen-talk .option[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; const tm = C.teams.teams[k];
    S.chosen = { team: { ...tm, key: k }, role: null }; submit('intro');
  }));
  $('#unsure').addEventListener('click', () => {
    $('#screen-talk').innerHTML = `<div class="wrap"><h2>${esc(u.coffeeTitle)}</h2><p class="lead">${esc(u.coffeeBody)}</p>
      <div class="btnrow"><button class="btn primary" id="coffeeyes">${esc(u.coffeeYes)}</button>
      <button class="btn quiet" id="coffeeno">${esc(u.coffeeNo)}</button></div></div>`;
    $('#coffeeyes').addEventListener('click', () => { S.chosen = null; submit('coffee'); });
    $('#coffeeno').addEventListener('click', () => { S.chosen = null; submit('keep'); });
  });
}

/* ---- door 3: remind me ---- */
function renderRemind() {
  const u = C.ui.remind;
  const iso = d => d.toISOString().slice(0, 10);
  const plus = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return iso(d); };
  const min = iso(new Date(Date.now() + 86400000));
  S.remindAt = S.availability === 'rest' ? plus(6) : plus(3);
  $('#screen-remind').innerHTML = `<div class="wrap"><h2>${esc(u.title)}</h2><p class="note">${esc(u.note)}</p>
    <div class="months">${u.months.map(o => `<button class="chip${plus(o.m) === S.remindAt ? ' on' : ''}" data-d="${plus(o.m)}">${esc(o.label)}</button>`).join('')}</div>
    <label class="alabel" for="remdate">${esc(u.custom)}</label>
    <input type="date" id="remdate" min="${min}" value="${S.remindAt}">
    <div class="btnrow"><button class="btn quiet" id="remback">${esc(C.ui.decide.back)}</button><button class="btn primary" id="remgo">${esc(u.btn)}</button></div></div>`;
  document.querySelectorAll('#screen-remind .chip').forEach(ch => ch.addEventListener('click', () => {
    S.remindAt = ch.dataset.d; $('#remdate').value = S.remindAt;
    document.querySelectorAll('#screen-remind .chip').forEach(x => x.classList.remove('on')); ch.classList.add('on');
  }));
  $('#remdate').addEventListener('change', e => { S.remindAt = e.target.value; document.querySelectorAll('#screen-remind .chip').forEach(x => x.classList.remove('on')); });
  $('#remback').addEventListener('click', () => show('decide'));
  $('#remgo').addEventListener('click', () => { if (S.remindAt) { S.chosen = null; submit('remind'); } });
}

/* ---------------- submit + confirm ---------------- */
function basePayload(action) {
  const R = S.result, name = k => C.A[k].name;
  return {
    action, first: S.first, last: S.last, email: S.email,
    fruitful: R.fruitful.map(x => ({ key: x.key, name: name(x.key), avg: +x.avg.toFixed(2), readiness: x.readiness, label: x.label })),
    faithful: R.faithful.map(x => ({ key: x.key, name: name(x.key), avg: +x.avg.toFixed(2) })),
    wearying: R.wearying.map(x => ({ key: x.key, name: name(x.key), avg: +x.avg.toFixed(2) })),
    scores: C.ORDER.map(k => ({ key: k, name: name(k), avg: +(R.energy[k] || 0).toFixed(2) })),
    audiences: S.audiences.map(k => labelOf(C.audiences.audiences, k)),
    availability: labelOf(C.availability.options, S.availability), availabilityKey: S.availability,
    about: {
      skills: S.about.skills,
      serveWith: S.about.serveWith.map(k => labelOf(C.about.serveWith, k)),
      barriers: S.about.barriers.map(k => labelOf(C.about.barriers, k)),
      rhythm: S.about.rhythm ? labelOf(C.about.rhythm, S.about.rhythm) : '',
      faith: S.about.faith ? labelOf(C.about.faith, S.about.faith) : ''
    },
    role: S.chosen && S.chosen.role ? { id: S.chosen.role.id, name: S.chosen.role.name, team: S.chosen.role.team, teamName: S.chosen.team.name, leader: S.chosen.team.leaderFull, leaderEmail: S.chosen.team.email, when: S.chosen.role.when, time: S.chosen.role.time } : null,
    team: S.chosen && S.chosen.team ? { key: S.chosen.team.key || (S.chosen.role && S.chosen.role.team), name: S.chosen.team.name, leader: S.chosen.team.leaderFull, leaderEmail: S.chosen.team.email } : null,
    suggested: S.matches.map(m => m.role.name),
    remindAt: S.remindAt || null,
    reportUrl: S.reportUrl,
    reportData: S.reportData,
    flags: R.flags,
    secondsToComplete: S.startedAt ? Math.round((Date.now() - S.startedAt) / 1000) : null,
    lang: LANG, source: 'thrive-quick-fit'
  };
}

async function post(extra) {
  try {
    const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...basePayload(extra.action), ...extra }) });
    return res.ok;
  } catch { return false; }
}

async function submit(action) {
  renderConfirm(action, 'pending'); show('confirm');
  const ok = await post({ action });
  renderConfirm(action, ok ? 'ok' : 'error');
}

function renderConfirm(action, state) {
  const u = C.ui.confirm, m = S.chosen;
  let title = '', body = '', extraBtn = '';
  if (state === 'error') { body = `<p class="error">${esc(u.error)}</p>`; }
  else if (action === 'try' && m) {
    title = u.title;
    body = `<p>${esc(t(u.body, { leader: m.team.leader, team: m.team.name, day: reachByDay(C.teams.reachByDays) }))}</p><p class="first">${esc(u.firstSunday)}</p>`;
    if (S.matches.length > 1) extraBtn = `<button class="btn quiet" id="another">${esc(u.another)}</button>`;
  } else if (action === 'intro' && m) {
    title = u.introTitle; body = `<p>${esc(t(u.introBody, { leader: m.team.leader, team: m.team.name }))}</p>`;
  } else if (action === 'coffee') {
    title = u.coffeeTitle; body = `<p>${esc(u.coffeeBody)}</p>`;
    extraBtn = `<a class="btn primary" href="${esc(C.teams.pastor.calendly)}" target="_blank" rel="noopener">${esc(u.coffeeBtn)}</a>`;
  } else if (action === 'remind') {
    const d = new Date(S.remindAt + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    title = u.remindTitle; body = `<p>${esc(t(u.remindBody, { date: d }))}</p>`;
  } else { title = u.keepTitle; body = `<p>${esc(u.keepBody)}</p>`; }

  $('#screen-confirm').innerHTML = `<div class="wrap"><h1>${esc(title)}</h1>${body}
    <div class="btnrow">${extraBtn}<button class="btn quiet" id="backdoors">${esc(u.doors)}</button><button class="btn ${action === 'coffee' ? 'quiet' : 'primary'}" id="done">${esc(u.done)}</button></div></div>`;
  const an = $('#another'); if (an) an.addEventListener('click', () => show('try'));
  $('#backdoors').addEventListener('click', () => show('decide'));
  $('#done').addEventListener('click', () => { window.location.href = 'https://loftcity.church'; });
}

/* ---------------- boot ---------------- */
loadContent().then(() => {
  document.title = C.ui.siteTitle;
  $('#brand').textContent = C.ui.brand;
  $('#motto').textContent = C.ui.motto;
  $('#f-address').textContent = C.ui.footer.address;
  $('#f-email').textContent = C.ui.footer.email;
  renderWelcome();
  show('welcome');
}).catch(err => {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Thrive could not load its content files. If you opened this file directly, run it through a local server (see README).</p>';
  console.error(err);
});
