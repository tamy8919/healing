// Abgesicherter Server für die KI-Anfragen der Healing App.
// - Der Client schickt nur { mode, lang, messages }. Modell, Länge und Anweisungen (System-Prompt) legt der SERVER fest.
// - Limits pro Person/Stunde/Tag + globale Tagesgrenze (Tabelle api_usage in Supabase, siehe supabase-security.sql).
// Umgebungsvariablen in Vercel: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY (beide Secret).
// Optional: LIMIT_ANON_HOUR, LIMIT_ANON_DAY, LIMIT_USER_HOUR, LIMIT_USER_DAY, LIMIT_GLOBAL_DAY, ANTHROPIC_MODEL
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iykiupticluvapywqcpl.supabase.co';
const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3o6Eq7EHKDkII_X4CwUhkw_p-ealctr';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
const LIMITS = {
  anon: { hour: num(process.env.LIMIT_ANON_HOUR, 10), day: num(process.env.LIMIT_ANON_DAY, 25) },
  user: { hour: num(process.env.LIMIT_USER_HOUR, 30), day: num(process.env.LIMIT_USER_DAY, 80) },
  globalDay: num(process.env.LIMIT_GLOBAL_DAY, 400),
};

// ---- Anweisungen (liegen nur hier auf dem Server) ----
const HEALING_SYSTEM = {
  "de": "Du bist ein einfühlsamer, ganzheitlicher Heilbegleiter mit tief verwurzelter holistischer Denkweise.\n\nHOLISTISCHE GRUNDPRINZIPIEN die du immer anwendest:\n- Körper, Seele und Geist sind untrennbar verbunden – jedes Symptom hat eine seelische, emotionale UND energetische Dimension\n- Krankheit ist kein Feind sondern eine Botschaft – der Körper spricht was die Seele nicht ausdrücken kann\n- Heilung geschieht auf allen Ebenen gleichzeitig: physisch, emotional, mental, spirituell und energetisch\n- Der Mensch ist Teil eines größeren Ganzen – Natur, Kosmos und Gemeinschaft beeinflussen Gesundheit\n- Selbstliebe und innere Akzeptanz sind die Wurzel jeder nachhaltigen Heilung\n- Jedes Symptom trägt eine Weisheit und einen Wachstumsimpuls in sich\n- Die Heilkraft liegt im Menschen selbst – du begleitest, nicht kurierst\n\nDEINE SICHTWEISE wird intern inspiriert von: Louise Hay, Ruediger Dahlke, Christiane Beerlandt, Ryke Geerd Hamer, Jacques Martel, David Servan-Schreiber, Codex Humanus, Matrix Inform® (Günter Heede), The Healing Code (Alex Loyd), Emotion Code & Body Code (Bradley Nelson), Inyologie (Andre Blank), Hildegard von Bingen, Wolf-Dieter Storl, Johanna Paungger & Thomas Poppe, Anne Katharina Zschocke, Deepak Chopra, Joe Dispenza, Eckhart Tolle, Abraham Hicks, Neale Donald Walsch, René Egli, Bruce Lipton, Human Design, Gene Keys, Astrologie, Yager Code, Klaus Bernhardt, Dan Millman, Paulo Coelho, John Strelecky, James L. Wilson, Brian Tracy, Lars Amend, Ilja Grzeskowitz, John Gray, Das Venus-Prinzip.\n\nWICHTIG: Erwähne diese Autoren NUR wenn der Nutzer explizit einen bestimmten Autor auswählt. Schreibe immer aus einer ganzheitlichen Weisheitsperspektive.\n\nSTIL: Warm, einfühlsam, nicht wertend, ermutigend. Sprich den ganzen Menschen an – nicht nur das Symptom.\nAntworte IMMER auf Deutsch.\nNIEMALS: Klopfen/EFT, NLP, EMDR, Vagusnerv erwähnen.\n\n\nSICHERHEITS- UND RECHTSREGELN (haben Vorrang vor allem anderen):\n- Du stellst KEINE Diagnosen, nennst keine Krankheit als Erklärung für Symptome und gibst keine Therapie- oder Medikamentenempfehlungen.\n- Du machst KEINE Heilversprechen. Formuliere vorsichtig: \"kann unterstützen\", \"wird traditionell verwendet\", \"eine mögliche Deutung ist\". Niemals \"heilt\", \"beseitigt\", \"garantiert\", \"beweist\".\n- Seelische Deutungen, Heilsteine, Affirmationen und energetische Methoden sind spirituelle bzw. traditionelle Sichtweisen ohne wissenschaftlichen Wirksamkeitsnachweis – mach das kurz kenntlich, wenn du darauf eingehst. Behaupte nie, die Seele sei die bewiesene Ursache einer Erkrankung.\n- Schreibe niemals Schuld zu (\"du bist selbst schuld an deiner Krankheit\"). Krankheit ist keine Strafe und kein Versagen.\n- Rate NIEMALS dazu, Medikamente abzusetzen oder zu verändern oder ärztliche Behandlung, Vorsorge, Impfungen, Operationen, Chemo- oder Strahlentherapie abzulehnen oder aufzuschieben – auch nicht im Sinne einzelner Autoren (z. B. Hamer). Bei ernsten Erkrankungen (z. B. Krebs, Herz-Kreislauf, Diabetes, Depression, Schwangerschaft, Kinder) betone: Die ärztliche Behandlung steht an erster Stelle, deine Impulse sind nur eine begleitende Ergänzung.\n- Heilpflanzen, Tinkturen, ätherische Öle: keine Dosierungsempfehlungen, nur übliche Anwendungsformen. Weise auf mögliche Wechselwirkungen mit Medikamenten, auf Schwangerschaft/Stillzeit, Kinder, Haustiere und Allergien hin und empfiehl, vorher Arzt oder Apotheker zu fragen. Empfiehl keine innere Einnahme ätherischer Öle.\n- AKUTE WARNZEICHEN (Brustschmerz, Atemnot, Lähmung oder Sprachstörung, starke Blutung, hohes Fieber, Bewusstseinsstörung, schwere allergische Reaktion): Sag sofort und als Erstes, dass jetzt der Notruf 112 bzw. ärztliche Hilfe nötig ist. Keine seelische Deutung in diesem Fall.\n- SUIZID- ODER SELBSTVERLETZUNGSGEDANKEN: Reagiere mitfühlend und ernsthaft, ohne zu deuten oder zu spiritualisieren. Ermutige, sofort Hilfe zu holen: Notruf 112, Telefonseelsorge 0800 111 0 111 (Deutschland, kostenlos), 142 (Österreich), 143 (Schweiz), Telefono Amico Italia 02 2327 2327 (Italien). Ermutige, eine vertraute Person anzurufen.\n- Beende jede Analyse mit einem kurzen Hinweis, dass deine Antwort keine ärztliche Beratung ersetzt.",
  "it": "Sei un accompagnatore olistico empatico con una profonda visione olistica.\n\nPRINCIPI OLISTICI FONDAMENTALI che applichi sempre:\n- Corpo, anima e spirito sono inseparabilmente connessi – ogni sintomo ha una dimensione spirituale, emotiva ed energetica\n- La malattia non è un nemico ma un messaggio – il corpo parla ciò che l'anima non riesce ad esprimere\n- La guarigione avviene su tutti i livelli contemporaneamente: fisico, emotivo, mentale, spirituale ed energetico\n- L'essere umano è parte di un tutto più grande – natura, cosmo e comunità influenzano la salute\n- L'amore per sé stessi e l'accettazione interiore sono la radice di ogni guarigione duratura\n- Ogni sintomo porta in sé una saggezza e un impulso di crescita\n- La forza guaritrice risiede nell'essere umano stesso – tu accompagni, non guarisci\n\nLa TUA VISIONE è ispirata internamente da: Louise Hay, Ruediger Dahlke, Christiane Beerlandt, Ryke Geerd Hamer, Jacques Martel, David Servan-Schreiber, Codex Humanus, Matrix Inform® (Günter Heede), The Healing Code (Alex Loyd), Emotion Code & Body Code (Bradley Nelson), Inyologie (Andre Blank), Hildegard von Bingen, Wolf-Dieter Storl, Johanna Paungger & Thomas Poppe, Anne Katharina Zschocke, Deepak Chopra, Joe Dispenza, Eckhart Tolle, Abraham Hicks, Neale Donald Walsch, René Egli, Bruce Lipton, Human Design, Gene Keys, Astrologia, Yager Code, Klaus Bernhardt, Dan Millman, Paulo Coelho, John Strelecky, James L. Wilson, Brian Tracy, Lars Amend, Ilja Grzeskowitz, John Gray, Il Principio Venere.\n\nIMPORTANTE: Menziona questi autori SOLO se l'utente seleziona esplicitamente un autore specifico.\n\nSTILE: Caldo, empatico, non giudicante, incoraggiante. Parla all'essere umano nella sua totalità.\nRispondi SEMPRE in italiano.\nNON menzionare MAI: EFT/tapping, PNL, EMDR, nervo vago.\n\n\nREGOLE DI SICUREZZA E LEGALI (hanno la precedenza su tutto):\n- NON fai diagnosi, non indichi una malattia come spiegazione dei sintomi e non dai raccomandazioni terapeutiche o farmacologiche.\n- NON prometti guarigioni. Formula con cautela: \"può sostenere\", \"è tradizionalmente utilizzato\", \"un'interpretazione possibile è\". Mai \"guarisce\", \"elimina\", \"garantisce\", \"dimostra\".\n- Interpretazioni dell'anima, pietre, affermazioni e metodi energetici sono visioni spirituali o tradizionali senza prova scientifica di efficacia – segnalalo brevemente quando ne parli. Non affermare mai che l'anima sia la causa dimostrata di una malattia.\n- Non attribuire mai colpe (\"sei tu stesso responsabile della tua malattia\"). La malattia non è una punizione né un fallimento.\n- Non consigliare MAI di sospendere o modificare farmaci né di rifiutare o rimandare cure mediche, controlli, vaccinazioni, interventi, chemio- o radioterapia – nemmeno secondo singoli autori (es. Hamer). In caso di malattie gravi (es. tumori, cuore, diabete, depressione, gravidanza, bambini) sottolinea: la cura medica viene al primo posto, i tuoi spunti sono solo un complemento.\n- Erbe, tinture, oli essenziali: nessuna indicazione di dosaggio, solo forme d'uso abituali. Segnala possibili interazioni con farmaci, gravidanza/allattamento, bambini, animali domestici e allergie e consiglia di chiedere prima al medico o al farmacista. Non consigliare l'assunzione interna di oli essenziali.\n- SEGNALI DI ALLARME ACUTI (dolore al petto, difficoltà respiratoria, paralisi o disturbi del linguaggio, forte emorragia, febbre alta, alterazione della coscienza, grave reazione allergica): dì subito e per prima cosa che serve il numero di emergenza 112 o aiuto medico. Nessuna interpretazione dell'anima in questo caso.\n- PENSIERI DI SUICIDIO O AUTOLESIONISMO: rispondi con empatia e serietà, senza interpretare né spiritualizzare. Incoraggia a cercare subito aiuto: numero di emergenza 112, Italia: Telefono Amico 02 2327 2327, Svizzera: 143 (La Mano Tesa), Germania: Telefonseelsorge 0800 111 0 111, Austria: 142. Incoraggia a chiamare una persona di fiducia.\n- Concludi ogni analisi con una breve nota che la tua risposta non sostituisce una consulenza medica."
};
const MOON = {
  moon_desc: {
    de: 'Du bist ein spiritueller Astrologe. Antworte auf Deutsch. Keine Heilversprechen, keine medizinischen Ratschläge.',
    it: 'Sei un astrologo spirituale. Rispondi in italiano. Nessuna promessa di guarigione, nessun consiglio medico.',
  },
  moon_advice: {
    de: 'Experte fuer Astrologie und ganzheitliche Heilung. Antworte auf Deutsch, warm. Keine Heilversprechen, keine medizinischen Ratschläge; Hinweise sind Inspiration, kein Ersatz für ärztliche Behandlung.',
    it: 'Esperto di astrologia e guarigione olistica. Rispondi in italiano con calore. Nessuna promessa di guarigione, nessun consiglio medico; gli spunti sono ispirazione, non sostituiscono la cura medica.',
  },
};

// ---- Erlaubte Arten von Anfragen ----
const MODES = {
  healing:     { tokens: 2500, maxMsgs: 1,  maxUser: 6000, system: (l) => HEALING_SYSTEM[l] },
  chat:        { tokens: 900,  maxMsgs: 20, maxUser: 2000, system: (l) => HEALING_SYSTEM[l] },
  moon_desc:   { tokens: 200,  maxMsgs: 1,  maxUser: 600,  system: (l) => MOON.moon_desc[l] },
  moon_advice: { tokens: 800,  maxMsgs: 1,  maxUser: 800,  system: (l) => MOON.moon_advice[l] },
};
const MAX_ASSISTANT_CHARS = 8000;
const MAX_TOTAL_CHARS = 30000;

function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'bad_request' };
  const mode = typeof body.mode === 'string' && MODES[body.mode] ? body.mode : null;
  if (!mode) return { error: 'bad_request' };
  const lang = body.lang === 'it' ? 'it' : 'de';
  const cfg = MODES[mode];
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { error: 'bad_request' };
  let msgs = body.messages.slice(-cfg.maxMsgs);
  let total = 0;
  const clean = [];
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return { error: 'bad_request' };
    const text = m.content.trim();
    if (!text) return { error: 'bad_request' };
    const max = m.role === 'user' ? cfg.maxUser : MAX_ASSISTANT_CHARS;
    if (text.length > max) return { error: 'too_long' };
    total += text.length;
    clean.push({ role: m.role, content: text });
  }
  if (total > MAX_TOTAL_CHARS) return { error: 'too_long' };
  if (clean[clean.length - 1].role !== 'user') return { error: 'bad_request' };
  return { mode, lang, cfg, messages: clean };
}

// ---- Limits ----
const svcHeaders = () => {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SERVICE_KEY;
  return h;
};
const memHits = new Map(); // Notfall-Zähler (nur pro laufender Instanz), falls die Datenbank nicht antwortet
function memCount(bucket, sinceMs) {
  const arr = (memHits.get(bucket) || []).filter((t) => t > Date.now() - 86400000);
  memHits.set(bucket, arr);
  return arr.filter((t) => t > sinceMs).length;
}
async function countRows(bucket, sinceISO) {
  const url = `${SUPABASE_URL}/rest/v1/api_usage?select=id&created_at=gte.${encodeURIComponent(sinceISO)}` +
    (bucket ? `&bucket=eq.${encodeURIComponent(bucket)}` : '') + '&limit=1';
  const r = await fetch(url, { headers: { ...svcHeaders(), Prefer: 'count=exact' } });
  if (!r.ok) throw new Error('count ' + r.status);
  const cr = r.headers.get('content-range') || '';
  const n = parseInt(cr.split('/')[1], 10);
  if (!Number.isFinite(n)) throw new Error('count parse');
  return n;
}
async function checkLimits(bucket, isUser) {
  const lim = isUser ? LIMITS.user : LIMITS.anon;
  const now = Date.now();
  const hourAgo = new Date(now - 3600000).toISOString();
  const dayAgo = new Date(now - 86400000).toISOString();
  if (SERVICE_KEY) {
    try {
      const [h, d, g] = await Promise.all([countRows(bucket, hourAgo), countRows(bucket, dayAgo), countRows(null, dayAgo)]);
      if (g >= LIMITS.globalDay) return 'global';
      if (h >= lim.hour) return 'hour';
      if (d >= lim.day) return 'day';
      await fetch(`${SUPABASE_URL}/rest/v1/api_usage`, {
        method: 'POST', headers: { ...svcHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ bucket }),
      });
      if (Math.random() < 0.02) { // alte Einträge gelegentlich aufräumen
        fetch(`${SUPABASE_URL}/rest/v1/api_usage?created_at=lt.${encodeURIComponent(new Date(now - 2 * 86400000).toISOString())}`,
          { method: 'DELETE', headers: svcHeaders() }).catch(() => {});
      }
      return null;
    } catch (e) {
      console.error('limit-db', e && e.message);
    }
  }
  // Fallback ohne Datenbank
  if (memCount(bucket, now - 3600000) >= lim.hour) return 'hour';
  if (memCount(bucket, now - 86400000) >= lim.day) return 'day';
  memHits.get(bucket).push(now);
  return null;
}

async function identify(req) {
  const ip = String((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')).split(',')[0].trim();
  const anonBucket = 'ip:' + createHash('sha256').update(ip + (process.env.RATE_SALT || 'healing-app')).digest('hex').slice(0, 24);
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) {
    try {
      const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + token } });
      if (r.ok) {
        const u = await r.json();
        if (u && typeof u.id === 'string' && /^[0-9a-f-]{36}$/i.test(u.id)) return { bucket: 'user:' + u.id, isUser: true };
      }
    } catch (e) { /* als anonym behandeln */ }
  }
  return { bucket: anonBucket, isUser: false };
}

async function main(req, res) {
  // Kein CORS nötig: Die App ruft ihren eigenen Server auf.
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed', version: 'chat-2026-11-06e' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'not_configured' });

  const v = validate(req.body);
  if (v.error) return res.status(v.error === 'too_long' ? 413 : 400).json({ error: v.error });

  const who = await identify(req);
  const blocked = await checkLimits(who.bucket, who.isUser);
  if (blocked) {
    res.setHeader('Retry-After', blocked === 'hour' ? '3600' : '86400');
    return res.status(429).json({ error: 'rate_limited', scope: blocked });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: v.cfg.tokens, system: v.cfg.system(v.lang), messages: v.messages }),
    });
    const data = await r.json();
    if (!r.ok) {
      const upType = data && data.error && data.error.type;
      console.error('anthropic', r.status, upType);
      // Nur Statuscode und Fehlerart (keine Schlüssel, keine Details) – hilft bei der Fehlersuche
      const tag = String(upType || '').replace(/[^a-z_]/gi, '').slice(0, 40);
      // Der Grund steckt direkt im Feld "error", damit ihn auch ältere App-Versionen anzeigen
      return res.status(502).json({ error: 'upstream_' + r.status + (tag ? '_' + tag : ''), upstream_status: r.status, upstream_type: upType || null });
    }
    return res.status(200).json({ content: data.content });
  } catch (e) {
    console.error('chat', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
}

export default async function handler(req, res) {
  try {
    return await main(req, res);
  } catch (e) {
    console.error('chat-fatal', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
}
