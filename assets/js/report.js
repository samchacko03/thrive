/**
 * Thrive report: data model, encoding, and the two-page renderer.
 * Matches docs/design/Thrive_Report.pdf exactly. Replace data only; do not restyle.
 *
 * Data model (what gets stored and what report.html receives):
 *   name, fullName, date, areas[13]{key,name,score,description,tier,readyNow,label}, cards{fruitful[],faithful[],wearying[]},
 *   roles[≤3]{ministry,role,schedule}, told{season,drawnTo,rhythm,serveWith,faith,skills}, questions[3], links{serve,coffee,retake}
 */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const t = (str, vars = {}) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function encodeReport(d) {
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeReport(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
}

/** Build the report data from app state. Cards come from the scoring model; list colors follow the design's tiers. */
export function buildReportData({ first, last, email, result, matches, audiencesLabels, availabilityLabel, aboutLabels, archetypes, order, ui, lang, links }) {
  const inF = new Set(result.fruitful.map(x => x.key)), inW = new Set(result.wearying.map(x => x.key));
  const areas = order.map(k => {
    const score = +(result.energy[k] || 0).toFixed(1);
    const f = result.fruitful.find(x => x.key === k);
    const tier = inF.has(k) ? 'fruitful' : (inW.has(k) || score < 2.5) ? 'wearying' : 'faithful';
    return { key: k, name: archetypes[k].name, score, description: archetypes[k].line, tier, readyNow: !!(f && f.readiness === 'ready'), label: f ? f.label : '' };
  });
  const byKey = Object.fromEntries(areas.map(a => [a.key, a]));
  const u = ui.report;
  return {
    v: 3, lang: lang || 'en',
    name: first, fullName: [first, last].filter(Boolean).join(' '), email,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    areas,
    cards: {
      fruitful: result.fruitful.map(x => x.key),
      faithful: result.faithful.map(x => x.key),
      wearying: result.wearying.map(x => x.key)
    },
    roles: matches.slice(0, 3).map(m => ({ ministry: m.team.name, role: m.role.name, schedule: `${m.role.when} · ${m.role.time || t(u.timeUnknown, { leader: m.team.leader })}` })),
    told: {
      season: availabilityLabel || '', drawnTo: (audiencesLabels || []).join(', '),
      rhythm: aboutLabels.rhythm || '', serveWith: (aboutLabels.serveWith || []).join(', '),
      faith: aboutLabels.faith || '', skills: aboutLabels.skills || ''
    },
    questions: u.reflect,
    links: links || { serve: 'loftcity.church/connect/serve', coffee: 'calendly.com/samchacko', retake: 'thrive.loftcity.church' },
    _lookup: Object.fromEntries(Object.entries(byKey).map(([k, a]) => [k, a.name]))
  };
}

export function reportHTML(d, u, logoOrange = 'assets/logo.png', logoWhite = 'assets/logo-white.png') {
  const A = Object.fromEntries(d.areas.map(a => [a.key, a]));
  const card = (k) => { const a = A[k]; return `<div class="card"><div class="card-top"><div class="card-name">${esc(a.name)}</div><div class="card-score">${a.score.toFixed(1)}</div></div>${a.label ? `<div class="ready">${esc(a.label)}</div>` : ''}<div class="card-desc">${esc(a.description)}</div></div>`; };
  const tier = (cls, dotCls, title, tag, keys) => keys.length ? `<div class="tier ${cls}"><div class="tier-h"><span class="dot ${dotCls}"></span><h2>${esc(title)}</h2><span class="tag">${esc(tag)}</span></div><div class="cards${keys.length === 1 ? ' one' : ''}">${keys.map(card).join('')}</div></div>` : '';
  const dots = (a) => { const n = Math.round(a.score); const c = a.tier === 'fruitful' ? 'orange' : a.tier === 'wearying' ? 'gray' : 'navy'; return `<span class="dots5 ${c}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const told = [['This season', d.told.season], ['Drawn to', d.told.drawnTo], ['Rhythm', d.told.rhythm], ['Serve with', d.told.serveWith], ['Faith', d.told.faith], ['Skills and languages', d.told.skills]].filter(([, v]) => v);
  const L = d.links;
  const foot = n => `<div class="footer"><span>LOFT City Church · Thrive</span><span>${n} of 2</span></div>`;

  return `<div class="tr">
  <div class="page">
    <div class="band">
      <div class="band-top"><img src="${logoWhite}" alt="LOFT City Church"><div class="prepared">Prepared for ${esc(d.fullName)}<br>on ${esc(d.date)}</div></div>
      <div class="eyebrow"><span class="dot"></span>${esc(u.eyebrow)}</div>
      <h1>${esc(t(u.title, { name: d.name }))}</h1>
      <div class="sub">${esc(u.sub)}</div>
    </div>
    <div class="body1">
      <div>
        ${tier('fruitful', '', u.fruitfulLabel, u.fruitfulNote, d.cards.fruitful)}
        ${tier('faithful', 'navy', u.faithfulLabel, u.faithfulNote, d.cards.faithful)}
        ${d.cards.wearying.length ? tier('wearying', 'hollow', u.wearyingLabel, u.wearyingNote, d.cards.wearying)
          : `<div class="tier wearying"><div class="tier-h"><span class="dot hollow"></span><h2>${esc(u.wearyingLabel)}</h2><span class="tag">${esc(u.noDrains)}</span></div></div>`}
      </div>
      <div class="areas">
        <h2>${esc(u.scoresTitle)}</h2>
        ${d.areas.map(a => `<div class="arow"><span class="nm">${esc(a.name)}</span>${dots(a)}<span class="sc">${a.score.toFixed(1)}</span></div>`).join('')}
        <div class="legend"><span><i style="background:var(--orange)"></i>${esc(u.fruitfulLabel)}</span><span><i style="background:var(--navy)"></i>${esc(u.faithfulLabel)}</span><span><i style="border:1.5px solid var(--n500)"></i>${esc(u.wearyingLabel)}</span></div>
      </div>
    </div>
    ${foot(1)}
  </div>
  <div class="page">
    <div class="body2">
      <h2 class="big">${esc(u.rolesTitle)}</h2>
      <div class="sub2">${esc(u.rolesNote)}</div>
      <div class="roles3">${d.roles.map(r => `<div class="rcard"><div class="min">${esc(r.ministry)}</div><div class="rn">${esc(r.role)}</div><div class="sch">${esc(r.schedule)}</div></div>`).join('')}</div>
      <div class="two">
        <div><h3>${esc(u.toldUsTitle)}</h3><div class="told">${told.map(([k, v]) => `<div class="k">${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div></div>
        <div><h3>${esc(u.reflectTitle)}</h3><ol class="qs">${d.questions.map((q, i) => `<li><b>${i + 1}</b><span>${esc(q)}</span></li>`).join('')}</ol></div>
      </div>
      <div class="ready-card">
        <div><h3>${esc(u.nextTitle)}</h3>
          <ul><li><span class="dot"></span>Sign up to serve: <a href="https://${esc(L.serve)}">${esc(L.serve)}</a></li>
              <li><span class="dot"></span>Coffee with Pastor Sam: <a href="https://${esc(L.coffee)}">${esc(L.coffee)}</a></li></ul>
          <div class="rn2">${esc(u.nextReturn)}</div></div>
        <img src="${logoWhite}" alt="">
      </div>
      <div class="quote"><p>${esc(u.scriptureText)}</p><cite>${esc(u.scriptureRef)}</cite></div>
    </div>
    ${foot(2)}
  </div>
</div>`;
}

/** Render into an element and keep it scaled to the container width on screen. */
export function renderReport(el, d, C, assets = {}) {
  const html = reportHTML(d, C.ui.report, assets.logoOrange, assets.logoWhite);
  el.innerHTML = `<div class="tr-wrap"><div class="tr-scale">${html}</div></div>`;
  const fit = () => {
    const sc = el.querySelector('.tr-scale'); if (!sc) return;
    const pageW = 816; // 8.5in at 96dpi
    const avail = el.clientWidth || el.parentElement.clientWidth || window.innerWidth;
    if (!avail) return;
    const s = Math.min(1, avail / pageW);
    sc.style.width = pageW + 'px';
    sc.style.transform = `scale(${s})`;
    const inner = sc.querySelector('.tr');
    sc.style.height = (inner.offsetHeight * s) + 'px';
  };
  fit();
  requestAnimationFrame(fit); setTimeout(fit, 250); setTimeout(fit, 1200);
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  el.__thriveFit = fit;
  return html;
}
