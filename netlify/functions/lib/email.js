/**
 * Email via Resend. One function, used by submit.js and send-reminders.js.
 * Env: RESEND_API_KEY, MAIL_FROM (e.g. "LOFT City Church <info@loftcity.church>")
 */
const BRAND = { navy: '#1A2E52', orange: '#E15628', cream: '#F4EFE7', ink: '#262626' };

export async function sendEmail({ to, cc, bcc, replyTo, subject, html, text, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  const from = process.env.MAIL_FROM || 'LOFT City Church <info@loftcity.church>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [].concat(to), cc: cc ? [].concat(cc) : undefined, bcc: bcc ? [].concat(bcc) : undefined, reply_to: replyTo, subject, html, text, attachments })
  });
  if (!res.ok) throw new Error('Resend ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Shared wrapper: navy header, cream body, LOFT footer. */
export function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:${BRAND.cream};font-family:'DM Sans',Arial,sans-serif;color:${BRAND.ink}">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:${BRAND.navy};color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
      <div style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-weight:800;font-size:22px;letter-spacing:.04em">LOFT City Church</div>
      <div style="font-size:13px;opacity:.85">Living Our Faith Together</div></div>
    <div style="background:#fff;padding:24px 22px;border:1px solid #e3dccd;border-top:4px solid ${BRAND.orange};border-radius:0 0 12px 12px">
      <h1 style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;color:${BRAND.navy};font-size:28px;margin:0 0 12px;line-height:1.1">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#7a8590;text-align:center;margin-top:16px">LOFT City Church · 1320 Holly Drive, Richardson, TX 75080 · info@loftcity.church</p>
  </div></body></html>`;
}

export const p = (s) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${s}</p>`;
export const btn = (href, label, primary = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 10px 0;padding:12px 22px;border-radius:99px;text-decoration:none;font-weight:700;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:17px;letter-spacing:.03em;${primary ? `background:${BRAND.orange};color:#fff` : `background:#fff;color:${BRAND.navy};border:1.5px solid #d9d3c6`}">${esc(label)}</a>`;

/** The report, as HTML for email (inline, no external CSS). */
export function reportHtml(d) {
  const row = (x) => `<div style="margin:0 0 8px"><strong>${esc(x.name)}</strong>${x.label ? ` <span style="font-size:12px;background:#EAF1E7;color:#4F7A4C;padding:2px 8px;border-radius:99px">${esc(x.label)}</span>` : ''} <span style="color:#8a94a0;font-size:13px">${x.avg}</span></div>`;
  const band = (title, color, items, empty) => `<div style="border-top:4px solid ${color};padding:10px 0 4px;margin-bottom:10px">
      <div style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-weight:700;font-size:20px;color:${color}">${title}</div>
      ${items.length ? items.map(row).join('') : `<div style="font-size:14px;color:#42505c">${esc(empty)}</div>`}</div>`;
  const scores = d.scores.map(s => `<tr><td style="font-size:13px;padding:2px 8px 2px 0">${esc(s.name)}</td><td style="width:60%"><div style="background:#F4EFE7;border-radius:99px;height:8px"><div style="width:${(s.avg / 5) * 100}%;background:${BRAND.navy};height:8px;border-radius:99px"></div></div></td><td style="font-size:12px;color:#8a94a0;padding-left:8px">${s.avg.toFixed(1)}</td></tr>`).join('');
  const roles = (d.suggested || []).length ? `<div style="margin:14px 0"><div style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-weight:700;font-size:20px;color:${BRAND.navy}">Roles at LOFT that fit you</div><div style="font-size:15px">${d.suggested.map(esc).join(' · ')}</div></div>` : '';
  return `
    ${band('Fruitful', '#4F7A4C', d.fruitful, '')}
    ${band('Faithful', '#B98A2E', d.faithful, 'No clear faithful areas this time.')}
    ${band('Wearying', '#6E7B86', d.wearying, 'No strong drains showed up. That is rare and worth noticing.')}
    <div style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-weight:700;font-size:20px;color:${BRAND.navy};margin-top:6px">All thirteen areas</div>
    <table style="width:100%;border-collapse:collapse;margin:6px 0 12px">${scores}</table>
    ${roles}
    <div style="font-style:italic;color:${BRAND.navy};border-left:4px solid ${BRAND.orange};padding:8px 12px;background:${BRAND.cream};border-radius:8px;font-size:15px">You are God's handiwork, created in Christ Jesus to do good works, which God prepared in advance for you to do. Ephesians 2:10</div>`;
}
