/**
 * POST /api/submit
 * One endpoint, several actions. The person's results travel with every call.
 *
 *   emailReport  email the person their report (no leader involvement)
 *   try          person wants to try a role once  -> leader task via Zapier (or PCO), confirmation email
 *   intro        person wants to learn about a team -> intro email: person + leader, BCC Sam; task to leader
 *   coffee       person unsure -> email person the Calendly link; email Sam a heads-up; task to Sam
 *   remind       person wants a check-in later -> store reminder (Netlify Blobs), email report now; task to Nincy
 *   keep         just save -> task to Nincy (no due date), nothing else
 *
 * Env: RESEND_API_KEY, MAIL_FROM, SITE_URL, THRIVE_DESTINATION (asana | zapier | planningcenter),
 *      ASANA_TOKEN (+ optional ASANA_PROJECT, ASANA_SECTION, ASANA_ROUTES_JSON), ZAPIER_HOOK_URL,
 *      PCO_CLIENT_ID, PCO_SECRET, PCO_FIELDS_JSON, PCO_WORKFLOWS_JSON
 * Never logs names or emails.
 */
import { getStore } from '@netlify/blobs';
import { sendEmail, layout, p, btn, reportHtml } from './lib/email.js';
import { randomBytes } from 'node:crypto';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let d;
  try { d = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  if (!d.email || !d.first || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return new Response('Missing name or email', { status: 400 });

  const site = process.env.SITE_URL || 'https://thrive.loftcity.church';
  const pastor = { name: 'Sam', email: process.env.PASTOR_EMAIL || 'sam@loftcity.church', calendly: process.env.PASTOR_CALENDLY || 'https://calendly.com/samchacko' };
  const t0 = new Date().toISOString();
  // Store the report under an unguessable id so the emailed link is short and reopenable.
  let report = d.reportUrl || site;
  if (d.reportData && typeof d.reportData === 'object') {
    try {
      const id = randomBytes(16).toString('base64url');
      await getStore('thrive-reports').setJSON(id, d.reportData);
      report = `${site}/report.html?id=${id}`;
      d.reportUrl = report;
    } catch (e) { /* fall back to the encoded link */ }
  }

  try {
    switch (d.action) {
      case 'emailReport':
        await mailReport(d, report);
        break;

      case 'try':
        await routeToTeam(d);
        await sendEmail({
          to: d.email, subject: `Your first Sunday with ${d.role.teamName}`,
          html: layout(`You're in, ${d.first}.`,
            p(`${esc(d.role.leader.split(' ')[0])} leads ${esc(d.role.teamName)} and will reach out within two days to set up a first Sunday for <strong>${esc(d.role.name)}</strong>.`) +
            p(`What that looks like: you'll be met at the door, given one real and small thing to do, introduced to a couple of people by name, and thanked before you leave. No commitment past that one Sunday.`) +
            btn(report, 'Open my Thrive report', false))
        });
        break;

      case 'intro': {
        const leaderFirst = (d.team.leader || '').split(' ')[0];
        const to = [d.email]; if (d.team.leaderEmail) to.push(d.team.leaderEmail);
        await sendEmail({
          to, bcc: pastor.email, replyTo: to,
          subject: `Introducing ${d.first} and ${leaderFirst} (${d.team.name})`,
          html: layout(`${esc(d.first)}, meet ${esc(leaderFirst)}.`,
            p(`${esc(d.first)} just took Thrive and wants to learn more about ${esc(d.team.name)}. ${esc(leaderFirst)}, ${esc(d.first)} is wired as ${esc(d.fruitful.map(x => x.name).join(' and '))}, and said this about their season: "${esc(d.availability)}."`) +
            p(`${esc(d.first)}, ask anything. ${esc(leaderFirst)}, a short reply with what the team actually does and what a first visit looks like is perfect. Nobody is signing up for anything here; this is just a conversation.`) +
            p(`Pastor Sam is copied so nothing falls through the cracks.`) +
            btn(report, `See ${esc(d.first)}'s Thrive report`, false))
        });
        await routeToTeam(d);
        break;
      }

      case 'coffee':
        await sendEmail({
          to: d.email, subject: 'Coffee with Pastor Sam',
          html: layout(`Sam would love that, ${d.first}.`,
            p(`You said you're not sure yet whether this is a season for serving or a season for rest and healing, or where you'd fit if you did serve. That is exactly the kind of conversation Sam wants to have with you. No agenda, no pressure.`) +
            p(`Pick a time that works for you, in person or on Zoom:`) +
            btn(pastor.calendly, 'Choose a time with Sam') + btn(report, 'Open my Thrive report', false))
        });
        await sendEmail({
          to: pastor.email, subject: `Coffee request: ${d.first} ${d.last} (Thrive)`,
          html: layout(`${esc(d.first)} ${esc(d.last)} wants coffee.`,
            p(`They took Thrive, chose "I'm not sure yet," and said yes to coffee. They've been sent your Calendly link.`) +
            p(`<strong>Email:</strong> ${esc(d.email)}<br><strong>Fruitful:</strong> ${esc(d.fruitful.map(x => `${x.name} (${x.label})`).join(', '))}<br><strong>Season:</strong> ${esc(d.availability)}${d.about && d.about.faith ? `<br><strong>Faith:</strong> ${esc(d.about.faith)}` : ''}`) +
            btn(report, 'Open their report', false))
        });
        await routeToTeam({ ...d, routeTo: 'pastor' });
        break;

      case 'remind': {
        if (!d.remindAt || !/^\d{4}-\d{2}-\d{2}$/.test(d.remindAt)) return json({ ok: false, error: 'bad date' }, 400);
        const store = getStore('thrive-reminders');
        const key = `${d.remindAt}/${d.email.toLowerCase()}`;
        await store.setJSON(key, { email: d.email, first: d.first, remindAt: d.remindAt, reportUrl: report, availabilityKey: d.availabilityKey, createdAt: t0 });
        await mailReport(d, report, `We'll check in on ${fmt(d.remindAt)}. Until then, nothing from us.`);
        await routeToTeam({ ...d, routeTo: 'general' });
        break;
      }

      case 'keep':
        await routeToTeam({ ...d, routeTo: 'general' });
        break;

      default:
        return json({ ok: false, error: 'unknown action' }, 400);
    }
    console.log(JSON.stringify({ t: t0, ok: true, action: d.action }));
    return json({ ok: true });
  } catch (err) {
    console.log(JSON.stringify({ t: t0, ok: false, action: d.action, error: String(err.message || err).slice(0, 200) }));
    return json({ ok: false }, 502);
  }
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
function fmt(iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }

async function mailReport(d, report, note) {
  await sendEmail({
    to: d.email, subject: `Your Thrive report, ${d.first}`,
    html: layout(`${esc(d.first)}, here's what we learned.`,
      p(`Take it, print it, pray over it. Nothing here commits you to anything.`) +
      (note ? p(`<strong>${esc(note)}</strong>`) : '') +
      btn(report, 'Open or print my full report') +
      reportHtml(d) +
      p(`Whenever you're ready: <a href="https://loftcity.church/connect/serve">sign up to serve</a>, or <a href="${esc(process.env.PASTOR_CALENDLY || 'https://calendly.com/samchacko')}">grab coffee with Pastor Sam</a>.`))
  });
}

/* ---------- Leader routing (Zapier default, Planning Center optional) ---------- */
async function routeToTeam(d) {
  const dest = (process.env.THRIVE_DESTINATION || 'asana').toLowerCase();
  try {
    if (dest === 'planningcenter') return await toPlanningCenter(d);
    if (dest === 'zapier') return await toZapier(d);
    return await toAsana(d);
  } catch (err) {
    // Leader routing must never cost the person their email. Log and carry on.
    console.log(JSON.stringify({ t: new Date().toISOString(), ok: false, route: dest, action: d.action, error: String(err.message || err).slice(0, 200) }));
  }
}

/* ---------- Asana direct: one task per submission in SLT Weekly Meeting > Serve at LOFT Submissions ---------- */
const ASANA = {
  project: '1214518298335134', section: '1219120496157986', workspace: '15707891628224',
  status: { field: '1214517961102883', notStarted: '1214517961102884' },
  dept: { field: '1214518052858173', worship: '1214517961102880', fm: '1214518052858179', hosp: '1214517961102875', missions: '1214517961102876', communication: '1214518052858178', cares: '1214518052858177', other: '1214517961102881' },
  // route_to -> { assignee user gid, department option }
  routes: {
    worship: { who: '1201379201949867', dept: 'worship' },   // Anil
    audio: { who: '1201379201949867', dept: 'worship' },
    video: { who: '1201379201949867', dept: 'worship' },
    fm: { who: '1212630982617210', dept: 'fm' },               // Morgan
    hosp: { who: '1207405527126525', dept: 'hosp' },           // Lexie
    prayer: { who: '1203627369742151', dept: 'other' },        // Christine
    missions: { who: '1212326660190408', dept: 'missions' },   // Jasper
    groups: { who: '1204937968390780', dept: 'other' },        // Kaley
    general: { who: '1202355615331489', dept: 'communication' }, // Nincy
    pastor: { who: '1205002162002617', dept: 'cares' }         // Sam
  },
  sam: '1205002162002617'
};

async function toAsana(d) {
  const token = process.env.ASANA_TOKEN || process.env[Object.keys(process.env).find(k => k.toLowerCase() === 'asana_token')] ; // key name is case-insensitive
  if (!token) { console.log(JSON.stringify({ t: new Date().toISOString(), route: 'asana', skipped: 'ASANA_TOKEN not set' })); return; }
  const overrides = process.env.ASANA_ROUTES_JSON ? JSON.parse(process.env.ASANA_ROUTES_JSON) : {};
  const key = teamKeyFor(d);
  const r = overrides[key] || ASANA.routes[key] || ASANA.routes.general;
  const teamName = d.role ? d.role.teamName : (d.team ? d.team.name : '');
  const name = {
    try: `Thrive: ${d.first} ${d.last} wants to try ${d.role ? d.role.name : 'a role'}`,
    intro: `Thrive: ${d.first} ${d.last} asked about ${teamName} (intro email sent, please reply)`,
    coffee: `Thrive: coffee with ${d.first} ${d.last}`,
    remind: `Thrive: ${d.first} ${d.last} asked for a check-in on ${d.remindAt} (automatic, no action)`,
    keep: `Thrive: ${d.first} ${d.last} saved results (do not contact)`
  }[d.action] || `Thrive: ${d.first} ${d.last} (${d.action})`;
  const dueOn = ['try', 'intro', 'coffee'].includes(d.action) ? new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) : undefined;
  const notes = summaryText(d) + (d.reportUrl ? `\n\nReport: ${d.reportUrl}` : '') + `\n\nEmail: ${d.email}`;
  const body = {
    data: {
      name, notes, assignee: r.who, due_on: dueOn,
      projects: [process.env.ASANA_PROJECT || ASANA.project],
      memberships: [{ project: process.env.ASANA_PROJECT || ASANA.project, section: process.env.ASANA_SECTION || ASANA.section }],
      followers: r.who === ASANA.sam ? [ASANA.sam] : [ASANA.sam, r.who],
      custom_fields: { [ASANA.status.field]: ASANA.status.notStarted, [ASANA.dept.field]: ASANA.dept[r.dept] || ASANA.dept.other }
    }
  };
  const res = await fetch('https://app.asana.com/api/1.0/tasks', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Asana ' + res.status + ' ' + (await res.text()).slice(0, 160));
}

function teamKeyFor(d) {
  if (d.routeTo) return d.routeTo;
  if (d.role) return d.role.team;
  if (d.team) return d.team.key;
  return 'general';
}

async function toZapier(d) {
  const url = process.env.ZAPIER_HOOK_URL;
  if (!url) return; // routing optional while piloting
  const flat = {
    action: d.action, route_to: teamKeyFor(d),
    first_name: d.first, last_name: d.last, email: d.email,
    fruitful: d.fruitful.map(x => `${x.name} (${x.label})`).join(', '),
    faithful: d.faithful.map(x => x.name).join(', '),
    wearying: d.wearying.map(x => x.name).join(', '),
    availability: d.availability, availability_key: d.availabilityKey,
    drawn_to: (d.audiences || []).join(', '),
    role_name: d.role ? d.role.name : '', role_team_name: d.role ? d.role.teamName : (d.team ? d.team.name : ''),
    role_leader: d.role ? d.role.leader : (d.team ? d.team.leader : ''), role_leader_email: d.role ? d.role.leaderEmail : (d.team ? d.team.leaderEmail : ''),
    role_when: d.role ? d.role.when : '', role_time: d.role ? d.role.time : '',
    suggested_roles: (d.suggested || []).join(', '),
    skills_languages: d.about ? d.about.skills : '', serve_with: d.about ? (d.about.serveWith || []).join(', ') : '',
    barriers: d.about ? (d.about.barriers || []).join(', ') : '', rhythm: d.about ? d.about.rhythm : '', faith_stage: d.about ? d.about.faith : '',
    remind_at: d.remindAt || '', report_url: d.reportUrl || '',
    flags: (d.flags || []).join(', '), seconds_to_complete: d.secondsToComplete,
    summary: summaryText(d), all_scores: d.scores.map(x => `${x.name} ${x.avg}`).join(', '),
    source: d.source, lang: d.lang
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flat) });
  if (!res.ok) throw new Error('Zapier responded ' + res.status);
}

const PCO = 'https://api.planningcenteronline.com/people/v2';
async function toPlanningCenter(d) {
  const id = process.env.PCO_CLIENT_ID, secret = process.env.PCO_SECRET;
  if (!id || !secret) throw new Error('PCO credentials not set');
  const H = { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' };
  const fields = JSON.parse(process.env.PCO_FIELDS_JSON || '{}');
  const workflows = JSON.parse(process.env.PCO_WORKFLOWS_JSON || '{}');
  const search = await (await fetch(`${PCO}/people?where[search_name_or_email]=${encodeURIComponent(d.email)}&per_page=5`, { headers: H })).json();
  let person = (search.data || [])[0];
  if (!person) {
    person = (await (await fetch(`${PCO}/people`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'Person', attributes: { first_name: d.first, last_name: d.last } } }) })).json()).data;
    await fetch(`${PCO}/people/${person.id}/emails`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'Email', attributes: { address: d.email, location: 'Home', primary: true } } }) });
  }
  const values = {
    thriveDate: new Date().toISOString().slice(0, 10),
    fruitful: d.fruitful.map(x => `${x.name} (${x.label})`).join(', '), faithful: d.faithful.map(x => x.name).join(', '), wearying: d.wearying.map(x => x.name).join(', '),
    top1: d.fruitful[0] ? d.fruitful[0].name : '', top2: d.fruitful[1] ? d.fruitful[1].name : '',
    availability: d.availability, drawnTo: (d.audiences || []).join(', '),
    roleChosen: d.role ? `${d.role.name} (${d.role.teamName})` : d.action, flags: (d.flags || []).join(', '),
    skills: d.about ? d.about.skills : '', serveWith: d.about ? (d.about.serveWith || []).join(', ') : '', barriers: d.about ? (d.about.barriers || []).join(', ') : '',
    rhythm: d.about ? d.about.rhythm : '', faith: d.about ? d.about.faith : '', reportUrl: d.reportUrl || '', remindAt: d.remindAt || ''
  };
  for (const [k, fid] of Object.entries(fields)) {
    if (!values[k]) continue;
    await fetch(`${PCO}/people/${person.id}/field_data`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'FieldDatum', attributes: { value: values[k] }, relationships: { field_definition: { data: { type: 'FieldDefinition', id: String(fid) } } } } }) });
  }
  const wid = workflows[teamKeyFor(d)] || workflows.general;
  if (!wid) return;
  const card = await (await fetch(`${PCO}/workflows/${wid}/cards`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'WorkflowCard', relationships: { person: { data: { type: 'Person', id: String(person.id) } } } } }) })).json();
  if (card.data && card.data.id) await fetch(`${PCO}/workflows/${wid}/cards/${card.data.id}/notes`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'WorkflowCardNote', attributes: { note: summaryText(d) } } }) });
}

function summaryText(d) {
  const L = [];
  const what = { try: 'wants to try a role', intro: 'asked to learn more about a team', coffee: 'asked for coffee with Sam to discern serving vs. rest', remind: `asked for a check-in on ${d.remindAt}`, keep: 'saved results only; asked not to be contacted' }[d.action] || d.action;
  L.push(`${d.first} ${d.last} completed Thrive and ${what}.`);
  if (d.role) L.push(`Role: ${d.role.name} (${d.role.teamName}). ${d.role.when}${d.role.time ? ', ' + d.role.time : ''}.`);
  else if (d.team) L.push(`Team of interest: ${d.team.name}.`);
  L.push(`Fruitful: ${d.fruitful.map(x => `${x.name} (${x.label})`).join(', ')}`);
  if (d.faithful.length) L.push(`Faithful: ${d.faithful.map(x => x.name).join(', ')}`);
  L.push(`Wearying: ${d.wearying.length ? d.wearying.map(x => x.name).join(', ') : 'none strong'}`);
  L.push(`Season: ${d.availability}`);
  if (d.audiences && d.audiences.length) L.push(`Drawn to: ${d.audiences.join(', ')}`);
  if (d.about) {
    if (d.about.skills) L.push(`Skills or languages: ${d.about.skills}`);
    if (d.about.serveWith && d.about.serveWith.length) L.push(`Wants to serve: ${d.about.serveWith.join(', ')}`);
    if (d.about.barriers && d.about.barriers.length) L.push(`Would make serving hard: ${d.about.barriers.join(', ')}`);
    if (d.about.rhythm) L.push(`Rhythm: ${d.about.rhythm}`);
    if (d.about.faith) L.push(`Faith: ${d.about.faith}`);
  }
  if (d.suggested && d.suggested.length) L.push(`Also suggested: ${d.suggested.join(', ')}`);
  if (d.flags && d.flags.length) L.push(`Note: answered ${d.flags.includes('uniform-answers') ? 'uniformly' : 'quickly'}; worth a conversation.`);
  if (d.reportUrl) L.push(`Report: ${d.reportUrl}`);
  if (d.action === 'try') L.push(`Next: text within 48 hours and offer two specific Sundays. One Sunday, no commitment.`);
  if (d.action === 'keep' || d.action === 'remind') L.push(`Next: nothing. They asked not to be contacted${d.action === 'remind' ? ' before the reminder date' : ''}.`);
  return L.join('\n');
}
