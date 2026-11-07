// Nimmt "Antwort melden" und Feedback entgegen und speichert sie in Supabase (Tabelle ai_reports).
// Gespeichert werden NICHT die Eingaben der Nutzerin, nur der Text der gemeldeten Antwort, der Grund, ein Kommentar und optional die E-Mail.
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iykiupticluvapywqcpl.supabase.co';
const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3o6Eq7EHKDkII_X4CwUhkw_p-ealctr';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KINDS = ['report', 'feedback'];
const REASONS = ['inaccurate', 'inappropriate', 'harmful', 'other'];
const MODES = ['healing', 'chat', 'moon_advice', 'moon_desc'];
const LIMIT_PER_HOUR = 6;

const svc = () => {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SERVICE_KEY;
  return h;
};
const clean = (v, n) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, n) : '');

async function identify(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const bucket = 'rep:' + createHash('sha256').update(ip + (process.env.RATE_SALT || 'healing-app')).digest('hex').slice(0, 24);
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) {
    try {
      const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + token } });
      if (r.ok) {
        const u = await r.json();
        if (u && typeof u.id === 'string' && /^[0-9a-f-]{36}$/i.test(u.id)) return { bucket: 'rep:user:' + u.id, userId: u.id };
      }
    } catch (e) { /* als anonym behandeln */ }
  }
  return { bucket, userId: null };
}

async function tooMany(bucket) {
  const since = new Date(Date.now() - 3600000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/api_usage?select=id&bucket=eq.${encodeURIComponent(bucket)}&created_at=gte.${encodeURIComponent(since)}&limit=1`;
  const r = await fetch(url, { headers: { ...svc(), Prefer: 'count=exact' } });
  if (!r.ok) throw new Error('count ' + r.status);
  const n = parseInt((r.headers.get('content-range') || '').split('/')[1], 10);
  return Number.isFinite(n) && n >= LIMIT_PER_HOUR;
}

async function main(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'not_configured' });
  const b = req.body && typeof req.body === 'object' ? req.body : null;
  if (!b) return res.status(400).json({ error: 'bad_request' });

  const kind = KINDS.includes(b.kind) ? b.kind : null;
  if (!kind) return res.status(400).json({ error: 'bad_request' });
  const lang = b.lang === 'it' ? 'it' : 'de';
  const comment = clean(b.comment, 1000);
  let reason = null, mode = null, answer = null, email = null;

  if (kind === 'report') {
    reason = REASONS.includes(b.reason) ? b.reason : null;
    mode = MODES.includes(b.mode) ? b.mode : null;
    answer = clean(b.answer, 6000);
    if (!reason || !answer) return res.status(400).json({ error: 'bad_request' });
  } else {
    if (!comment) return res.status(400).json({ error: 'bad_request' });
    const e = clean(b.email, 200);
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) email = e;
  }

  const who = await identify(req);
  try {
    if (await tooMany(who.bucket)) return res.status(429).json({ error: 'rate_limited' });
  } catch (e) {
    console.error('report-limit', e && e.message);   // bei Fehler nicht blockieren
  }

  const row = { kind, user_id: who.userId, mode, lang, reason, comment: comment || null, answer, contact_email: email };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_reports`, { method: 'POST', headers: { ...svc(), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!r.ok) {
    console.error('report-insert', r.status);
    return res.status(500).json({ error: 'save_failed' });
  }
  fetch(`${SUPABASE_URL}/rest/v1/api_usage`, { method: 'POST', headers: { ...svc(), Prefer: 'return=minimal' }, body: JSON.stringify({ bucket: who.bucket }) }).catch(() => {});
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  try {
    return await main(req, res);
  } catch (e) {
    console.error('report-fatal', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
}
