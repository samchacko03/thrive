/** GET /api/report?id=... returns a stored report (JSON). Links are unguessable 22-char ids. */
import { getStore } from '@netlify/blobs';
export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const data = await getStore('thrive-reports').get(id, { type: 'json' });
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
};
