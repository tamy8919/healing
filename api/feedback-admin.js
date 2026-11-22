// Liefert die Tester-Rückmeldungen – nur für die Inhaberin (E-Mail muss in OWNER_EMAILS stehen).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iykiupticluvapywqcpl.supabase.co';
const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3o6Eq7EHKDkII_X4CwUhkw_p-ealctr';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAILS = (process.env.OWNER_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);

const svc = () => {
  const h = { apikey: SERVICE_KEY };
  if (SERVICE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SERVICE_KEY;
  return h;
};

async function main(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'not_configured' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(403).json({ error: 'forbidden' });
  const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + token } });
  if (!u.ok) return res.status(403).json({ error: 'forbidden' });
  const me = await u.json();
  const mail = String((me && me.email) || '').toLowerCase();
  if (!mail || !OWNER_EMAILS.includes(mail)) return res.status(403).json({ error: 'forbidden' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_reports?kind=eq.tester&order=created_at.desc&limit=300&select=id,created_at,lang,details,contact_email`, { headers: svc() });
  if (!r.ok) return res.status(500).json({ error: 'load_failed' });
  return res.status(200).json({ rows: await r.json() });
}

export default async function handler(req, res) {
  try {
    return await main(req, res);
  } catch (e) {
    console.error('feedback-admin', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
}
