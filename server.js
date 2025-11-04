// server.js
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { initDB } from './db.js';

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_me';
app.use(express.static(path.join(__dirname, 'public')));
const db = await initDB();

// vytvoření admina (pokud neexistuje)
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const pass  = process.env.ADMIN_PASSWORD || 'changeme123';
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);

  // reset pokud je ADMIN_RESET=1
  if (process.env.ADMIN_RESET === '1' && exists) {
    const hash = await bcrypt.hash(pass, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hash, email]);
    console.log(`🔐 Admin heslo aktualizováno pro ${email}`);
    return;
  }

  if (!exists) {
    const hash = await bcrypt.hash(pass, 10);
    await db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash]);
    console.log(`✅ Admin vytvořen: ${email}`);
  }
}
await ensureAdmin();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:"],
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.redirect('/admin/login');
}

/* ---------- PUBLIC ---------- */
app.get('/', (req, res) => {
  res.render('index', {
    agent: {
      name: 'Rostislav Kandel',
      title: 'Realitní makléř',
      phone: '+420 777 224 185',
      email: 'rkandel@mmreality.cz',
      photo: '/img/rostislav-kandel.jpg'
    }
  });
});

app.post('/lead', async (req, res) => {
  try {
    let { city, psc, type, area, layout, balcony, condition, first_name, last_name, email, phone } = req.body;

    type ??= '';
    const pscOk   = /^[0-9]{3}\s?[0-9]{2}$/.test(psc || '');
    const areaOk  = Number(area) > 0;
    const phoneOk = /^[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/.test(phone || '');
    const emailOk = /@/.test(email || '');

    balcony   = (type?.toLowerCase() === 'byt') ? (balcony || '') : '';
    condition = (condition || '').trim().toLowerCase();

    if (!city || !pscOk || !type || !areaOk || !first_name || !last_name || !emailOk || !phoneOk) {
      return res.status(400).send('Chybí požadované údaje nebo nejsou ve správném formátu.');
    }
    if (!layout && type.toLowerCase() === 'pozemek') layout = 'pozemek';

    await db.run(
      `INSERT INTO leads (city, psc, type, area, layout, balcony, condition, first_name, last_name, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ city.trim(), psc.trim(), type.toLowerCase(), Number(area),
        (layout||'').trim(), (balcony||'').trim(), (condition||'').trim(),
        first_name.trim(), last_name.trim(), email.trim(), phone.trim() ]
    );

    res.redirect('/thanks');
  } catch (e) {
    console.error(e);
    res.status(500).send('Něco se pokazilo.');
  }
});


app.get('/thanks', (req, res) => res.render('thanks'));

/* ---------- ADMIN ---------- */
app.get('/admin/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', async (req, res) => {
  const { email, password, remember } = req.body;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).render('admin/login', { error: 'Neplatné přihlašovací údaje.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).render('admin/login', { error: 'Neplatné přihlašovací údaje.' });

  req.session.userId = user.id;

  // „Zůstat přihlášen“ (30 dní)
  if (remember === 'on') {
    req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
  } else {
    req.session.cookie.expires = false; // session cookie
  }

  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

app.get('/admin', requireAuth, async (req, res) => {
  const leads = await db.all(`
  SELECT id, city, psc, type, area, layout, balcony, condition, first_name, last_name, contacted, created_at
  FROM leads
  ORDER BY created_at DESC
`);
  res.render('admin/dashboard', { leads });
});

app.post('/admin/leads/:id/contacted', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT contacted FROM leads WHERE id = ?', [id]);
  if (!current) return res.status(404).send('Nenalezeno.');
  const next = current.contacted ? 0 : 1;
  await db.run('UPDATE leads SET contacted = ? WHERE id = ?', [next, id]);
  res.redirect('/admin');
});

app.get('/admin/leads/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', [id]);
  if (!lead) return res.status(404).send('Poptávka nenalezena.');
  res.render('admin/lead', { lead });
});

app.listen(PORT, () => console.log(`✅ Server běží na http://localhost:${PORT}`));
