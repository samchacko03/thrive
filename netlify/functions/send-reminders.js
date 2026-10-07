/**
 * Scheduled: runs every morning and sends the reminders due today.
 * Schedule is set in netlify.toml (13:00 UTC = 8:00 AM Central).
 * Reminders live in Netlify Blobs under thrive-reminders/<YYYY-MM-DD>/<email>.
 */
import { getStore } from '@netlify/blobs';
import { sendEmail, layout, p, btn } from './lib/email.js';

export default async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD
  const store = getStore('thrive-reminders');
  const site = process.env.SITE_URL || 'https://thrive.loftcity.church';
  const calendly = process.env.PASTOR_CALENDLY || 'https://calendly.com/samchacko';
  let sent = 0, failed = 0;

  // Send today's and any missed earlier days (in case a run was skipped).
  const { blobs } = await store.list({ prefix: '' });
  for (const b of blobs) {
    const date = b.key.slice(0, 10);
    if (date > today) continue;
    try {
      const r = await store.get(b.key, { type: 'json' });
      if (!r) continue;
      await sendEmail({
        to: r.email, subject: `Checking in, ${r.first}`,
        html: layout(`${r.first}, you asked us to check in.`,
          p(`A while back you took Thrive and asked us to wait until now. So here we are, with no agenda. Your report is still yours, and every door is still open.`) +
          (r.availabilityKey === 'rest' ? p(`You were in a season of rest and healing then. If that's still the season, that is completely fine. Rest is holy.`) : '') +
          btn(r.reportUrl || site, 'Open my Thrive report') +
          btn('https://loftcity.church/connect/serve', 'Try a role', false) +
          btn(calendly, 'Coffee with Pastor Sam', false) +
          btn(site, 'Retake Thrive', false) +
          p(`If you'd like another reminder instead, just retake Thrive and pick a new date. Otherwise, you won't hear from us about this again.`))
      });
      await store.delete(b.key);
      sent++;
    } catch (err) {
      failed++;
      console.log(JSON.stringify({ t: new Date().toISOString(), ok: false, key: b.key.slice(0, 10), error: String(err.message || err).slice(0, 120) }));
    }
  }
  console.log(JSON.stringify({ t: new Date().toISOString(), ok: true, today, sent, failed }));
  return new Response(JSON.stringify({ sent, failed }));
};

export const config = { schedule: '0 13 * * *' };
