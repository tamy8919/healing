// Nimmt "Antwort melden" und Feedback entgegen und speichert sie in Supabase (Tabelle ai_reports).
// Gespeichert werden NICHT die Eingaben der Nutzerin, nur der Text der gemeldeten Antwort, der Grund, ein Kommentar und optional die E-Mail.
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iykiupticluvapywqcpl.supabase.co';
const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3o6Eq7EHKDkII_X4CwUhkw_p-ealctr';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KINDS = ['report', 'feedback', 'tester'];
const RATING_KEYS = ['design', 'usability', 'answers', 'trust'];
const FEATURE_KEYS = ['login', 'analysis', 'lexicon', 'chat', 'card', 'moon', 'journal', 'translate', 'report', 'dark', 'lang'];
const REASONS = ['inaccurate', 'inappropriate', 'harmful', 'other'];
const MODES = ['healing', 'chat', 'moon_advice', 'moon_desc'];
const LIMIT_PER_HOUR = 6;

const svc = () => {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SERVICE_KEY;
  return h;
};
// Optional: E-Mail-Benachrichtigung über Resend (nur aktiv, wenn RESEND_API_KEY und NOTIFY_EMAIL gesetzt sind)
const esc = (t) => String(t || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function notify(row) {
  const key = process.env.RESEND_API_KEY, to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return;
  const labels = { inaccurate: 'Ungenau oder falsch', inappropriate: 'Unangemessen oder verletzend', harmful: 'Gefährlich oder gesundheitsschädlich', other: 'Sonstiges' };
  const harmful = row.reason === 'harmful';
  if (row.kind === 'tester') {
    const d = row.details || {}, rt = d.ratings || {};
    const vals = Object.values(rt);
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '–';
    const names = { design: 'Design', usability: 'Bedienung', answers: 'Qualität der Antworten', trust: 'Vertrauen' };
    const html2 = '<div style="font-family:Georgia,serif;line-height:1.6">'
      + '<p><b>📝 Neues Tester-Feedback (Ø ' + avg + ' von 5)</b></p>'
      + '<p>' + Object.keys(rt).map((k) => esc(names[k] || k) + ': ' + '★'.repeat(rt[k]) + '☆'.repeat(5 - rt[k])).join('<br>') + '</p>'
      + (d.tested && d.tested.length ? '<p><b>Getestet:</b> ' + esc(d.tested.join(', ')) + '</p>' : '')
      + (d.likes ? '<p><b>👍 Gefällt:</b><br>' + esc(d.likes).replace(/\n/g, '<br>') + '</p>' : '')
      + (d.improve ? '<p><b>🔧 Verbessern:</b><br>' + esc(d.improve).replace(/\n/g, '<br>') + '</p>' : '')
      + (d.name || row.contact_email ? '<p><b>Kontakt:</b> ' + esc(d.name) + ' ' + esc(row.contact_email) + '</p>' : '')
      + (d.device ? '<p style="color:#888;font-size:12px">' + esc(d.device) + '</p>' : '')
      + '<p style="color:#888">Sprache: ' + esc(row.lang) + ' · Alle Rückmeldungen: in der App unten „📊 Auswertung“</p></div>';
    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 6000);
    try {
      const r2 = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Healing App <onboarding@resend.dev>', to: [to], subject: '📝 Healing App: Tester-Feedback (Ø ' + avg + ')', html: html2 }),
        signal: c2.signal,
      });
      if (!r2.ok) console.error('report-mail', r2.status);
    } catch (e) { console.error('report-mail', e && e.message); } finally { clearTimeout(t2); }
    return;
  }
  const subject = (harmful ? '⚠️ ' : '') + (row.kind === 'report' ? 'Healing App: Antwort gemeldet' + (row.reason ? ' – ' + labels[row.reason] : '') : 'Healing App: neues Feedback');
  const html = '<div style="font-family:Georgia,serif;line-height:1.6">'
    + '<p><b>' + esc(subject) + '</b></p>'
    + '<p>Sprache: ' + esc(row.lang) + (row.mode ? ' · Bereich: ' + esc(row.mode) : '') + '</p>'
    + (row.comment ? '<p><b>Kommentar:</b><br>' + esc(row.comment).replace(/\n/g, '<br>') + '</p>' : '')
    + (row.answer ? '<p><b>Gemeldete Antwort:</b><br>' + esc(row.answer.slice(0, 2500)).replace(/\n/g, '<br>') + '</p>' : '')
    + (row.contact_email ? '<p><b>Kontakt:</b> ' + esc(row.contact_email) + '</p>' : '')
    + '<p style="color:#888">Alle Meldungen: Supabase → Table Editor → ai_reports</p></div>';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Healing App <onboarding@resend.dev>', to: [to], subject, html }),
      signal: ctrl.signal,
    });
    if (!r.ok) console.error('report-mail', r.status);
  } catch (e) {
    console.error('report-mail', e && e.message);
  } finally {
    clearTimeout(timer);
  }
}
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
  let reason = null, mode = null, answer = null, email = null, details = null;

  if (kind === 'report') {
    reason = REASONS.includes(b.reason) ? b.reason : null;
    mode = MODES.includes(b.mode) ? b.mode : null;
    answer = clean(b.answer, 6000);
    if (!reason || !answer) return res.status(400).json({ error: 'bad_request' });
  } else if (kind === 'tester') {
    const rin = b.ratings && typeof b.ratings === 'object' ? b.ratings : {};
    const ratings = {};
    RATING_KEYS.forEach((k) => { const v = Number(rin[k]); if (Number.isInteger(v) && v >= 1 && v <= 5) ratings[k] = v; });
    const tested = Array.isArray(b.tested) ? b.tested.filter((x) => FEATURE_KEYS.includes(x)) : [];
    const likes = clean(b.likes, 1500), improve = clean(b.improve, 1500);
    if (!Object.keys(ratings).length && !tested.length && !likes && !improve) return res.status(400).json({ error: 'bad_request' });
    const e2 = clean(b.email, 200);
    if (e2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e2)) email = e2;
    details = { ratings, tested, likes, improve, name: clean(b.name, 80), device: clean(b.device, 300) };
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
  if (details) row.details = details;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_reports`, { method: 'POST', headers: { ...svc(), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!r.ok) {
    console.error('report-insert', r.status);
    return res.status(500).json({ error: 'save_failed' });
  }
  fetch(`${SUPABASE_URL}/rest/v1/api_usage`, { method: 'POST', headers: { ...svc(), Prefer: 'return=minimal' }, body: JSON.stringify({ bucket: who.bucket }) }).catch(() => {});
  await notify(row);
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
