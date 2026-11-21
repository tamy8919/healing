// Healing App – Node-Server für Hostinger (ersetzt Vercel)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import chat from './api/chat.js';
import report from './api/report.js';
import deleteAccount from './api/delete-account.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Sicherheits-Header (wie vorher in vercel.json)
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://tamarajost.com https://www.tamarajost.com");
  res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://iykiupticluvapywqcpl.supabase.co wss://iykiupticluvapywqcpl.supabase.co; base-uri 'self'; form-action 'self'; object-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// API
app.use('/api', express.json({ limit: '200kb' }));
const wrap = (h) => async (req, res) => {
  try { await h(req, res); } catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: 'server_error' }); }
};
app.all('/api/chat', wrap(chat));
app.all('/api/report', wrap(report));
app.all('/api/delete-account', wrap(deleteAccount));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// Digital Asset Links für die Android-App
app.use('/.well-known', express.static(path.join(PUBLIC, '.well-known'), {
  dotfiles: 'allow',
  setHeaders: (res) => res.setHeader('Content-Type', 'application/json')
}));

// Statische Dateien
app.use(express.static(PUBLIC, {
  extensions: ['html'],
  setHeaders: (res, file) => {
    if (file.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (file.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Healing App läuft auf Port ' + port));
