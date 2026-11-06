// Löscht das eigene Konto und alle Daten der angemeldeten Person (DSGVO Art. 17).
// Benötigt in Vercel die Umgebungsvariable SUPABASE_SERVICE_ROLE_KEY (geheim, nie im Browser!).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iykiupticluvapywqcpl.supabase.co';
  const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3o6Eq7EHKDkII_X4CwUhkw_p-ealctr';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server nicht konfiguriert' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });

  const svc = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('eyJ')) svc.Authorization = 'Bearer ' + SERVICE_KEY;

  try {
    // 1) Wer ist angemeldet? Die Person kann nur sich selbst löschen.
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + token },
    });
    if (!who.ok) return res.status(401).json({ error: 'Ungültige Anmeldung' });
    const user = await who.json();
    const id = user && user.id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(401).json({ error: 'Ungültige Anmeldung' });

    // 2) Gespeicherte Inhalte löschen
    for (const table of ['saved_analyses', 'diary_entries']) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...svc, Prefer: 'return=minimal' },
      });
      if (!r.ok) throw new Error(table + ' ' + r.status);
    }

    // 3) Konto löschen
    const d = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: svc });
    if (!d.ok) throw new Error('user ' + d.status);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('delete-account', e && e.message);
    return res.status(500).json({ error: 'Löschen fehlgeschlagen' });
  }
}
