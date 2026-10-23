// Fills Doable with realistic demo data through the real API, so history and notifications
// fill up too. Run it with:  docker compose --profile demo run --rm seed
// Every demo account uses the password below. Running it twice does nothing the second time.

const API = (process.env.API_URL ?? 'http://backend:8080') + '/api';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const PASSWORD = 'Doable2026!';

const people = {
  maya: { accountType: 'ORGANIZATION', name: 'Maya Andersen', email: 'maya@northwind.demo', organizationName: 'Northwind Studio', teamSize: '11-50', jobTitle: 'Head of Product' },
  leo: { accountType: 'ORGANIZATION', name: 'Leo Martin', email: 'leo@northwind.demo', organizationName: 'Northwind Studio', teamSize: '11-50', jobTitle: 'Product Designer' },
  sara: { accountType: 'ORGANIZATION', name: 'Sara Haddad', email: 'sara@northwind.demo', organizationName: 'Northwind Studio', teamSize: '11-50', jobTitle: 'Lead Developer' },
  omar: { accountType: 'INDIVIDUAL', name: 'Omar Benali', email: 'omar@client.demo', useCase: 'work' },
  ines: { accountType: 'INDIVIDUAL', name: 'Ines Dupont', email: 'ines@student.demo', useCase: 'study' },
};

// ---- helpers ----

const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const at = (n, hh, mm = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.detail ?? text}`);
  return data;
}

/**
 * Logs in if the account already exists and is verified; otherwise signs up and confirms the
 * email with the code from Mailpit. With MAILPIT_URL=none (a live server, where .demo addresses
 * get no mail) it returns null for an account still waiting for verification.
 */
async function join(p) {
  try {
    return (await call(null, 'POST', '/auth/login', { email: p.email, password: PASSWORD })).token;
  } catch (e) {
    if (/→ 403/.test(e.message)) return null; // exists, not verified yet
  }
  const r = await call(null, 'POST', '/auth/signup', { ...p, password: PASSWORD });
  if (r.token) return r.token;
  if (MAILPIT === 'none') return null;
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(MAILPIT + '/api/v1/messages')).json();
    const m = list.messages.find((x) => x.To.some((t) => t.Address === p.email));
    const code = m?.Subject.match(/\d{6}/)?.[0];
    if (code) return (await call(null, 'POST', '/auth/verify-email', { email: p.email, code })).token;
    await sleep(300);
  }
  throw new Error('No verification email for ' + p.email + ' (is Mailpit running?)');
}

async function main() {
  // Already seeded? Maya has more than her Inbox.
  try {
    const { token } = await call(null, 'POST', '/auth/login', { email: people.maya.email, password: PASSWORD });
    if ((await call(token, 'GET', '/projects')).length > 1) {
      console.log('Demo data is already there. Log in as maya@northwind.demo / ' + PASSWORD);
      return;
    }
  } catch { /* not yet: carry on */ }

  console.log('Creating people…');
  const t = {};
  for (const [key, p] of Object.entries(people)) t[key] = await join(p);
  const waiting = Object.keys(people).filter((key) => !t[key]);
  if (waiting.length) {
    console.log('These accounts exist but need their email verified before the data can be added:');
    for (const key of waiting) console.log('  ' + people[key].email);
    console.log("Mark them verified in the database (update users set email_verified_at = now() where email like '%.demo'), then run this again.");
    process.exit(2);
  }
  const ids = {};
  for (const key of Object.keys(people)) ids[key] = (await call(t[key], 'GET', '/me')).id;

  const api = (who, method, path, body) => call(t[who], method, path, body);
  const task = (who, body) => api(who, 'POST', '/tasks', body);
  const done = (who, id) => api(who, 'PATCH', `/tasks/${id}`, { completed: true });
  const comment = (who, id, body) => api(who, 'POST', `/tasks/${id}/comments`, { body });

  console.log('Categories and labels…');
  const cat = {};
  for (const [name, color] of [['Work', 'sky'], ['Client', 'teal'], ['Personal', 'clay'], ['Errands', 'lime'], ['Learning', 'plum'], ['Health', 'rose']]) {
    cat[name] = (await api('maya', 'POST', '/categories', { name, color })).id;
  }
  const leoCat = {};
  for (const [name, color] of [['Design', 'plum'], ['Admin', 'slate']]) leoCat[name] = (await api('leo', 'POST', '/categories', { name, color })).id;
  const inesCat = {};
  for (const [name, color] of [['University', 'sky'], ['Home', 'clay'], ['Travel', 'sun']]) inesCat[name] = (await api('ines', 'POST', '/categories', { name, color })).id;

  console.log('Projects and sharing…');
  const proj = async (who, name, color, favorite = false) => (await api(who, 'POST', '/projects', { name, color, favorite })).id;
  const web = await proj('maya', 'Website Redesign', 'teal', true);
  const app = await proj('maya', 'Mobile App Launch', 'sky', true);
  const mkt = await proj('maya', 'Q4 Marketing', 'plum');
  const home = await proj('maya', 'Home', 'clay');
  const reading = await proj('maya', 'Reading list', 'lime');
  const intranet = await proj('maya', 'Old intranet', 'slate');

  const invite = async (pid, who, role) => api('maya', 'POST', `/projects/${pid}/invites`, { email: people[who].email, role });
  const acceptAll = async (who) => { for (const i of await api(who, 'GET', '/invites')) await api(who, 'POST', `/invites/${i.id}/accept`); };
  await invite(web, 'leo', 'MEMBER'); await invite(web, 'sara', 'MEMBER'); await invite(web, 'omar', 'GUEST');
  await invite(app, 'sara', 'ADMIN'); await invite(app, 'leo', 'MEMBER');
  await invite(mkt, 'leo', 'MEMBER');
  await acceptAll('leo'); await acceptAll('sara'); await acceptAll('omar');
  // Waiting invitations: someone without an account yet, and one Maya hasn't answered.
  await api('maya', 'POST', `/projects/${web}/invites`, { email: 'new.hire@northwind.demo', role: 'MEMBER' });

  console.log('Website Redesign…');
  const w = {};
  w.brief = await task('maya', { title: 'Sign off the project brief with the client', projectId: web, priority: 1, dueDate: day(-2), categoryId: cat.Client, labels: ['client', 'meeting'], description: 'Scope, timeline and budget. Omar has the final say on the homepage.' });
  w.audit = await task('maya', { title: 'Content audit of the current site', projectId: web, priority: 2, dueDate: day(-5), categoryId: cat.Work, labels: ['research'], assigneeId: ids.leo });
  w.wire = await task('maya', { title: 'Wireframes for home, pricing and contact', projectId: web, priority: 1, dueDate: day(0), dueTime: '15:00', durationMinutes: 120, categoryId: cat.Work, labels: ['design'], assigneeId: ids.leo, deadline: at(1, 18) });
  for (const s of ['Home page layout', 'Pricing table states', 'Contact form + errors', 'Mobile breakpoints']) await task('leo', { title: s, parentId: w.wire.id });
  w.ds = await task('maya', { title: 'Design system: colors, type and buttons', projectId: web, priority: 2, dueDate: day(2), categoryId: cat.Work, labels: ['design'], assigneeId: ids.leo });
  const tokens = await task('leo', { title: 'Define color tokens', parentId: w.ds.id });
  await task('leo', { title: 'Light and dark themes', parentId: tokens.id });
  await task('leo', { title: 'Contrast check (4.5:1)', parentId: tokens.id });
  await task('leo', { title: 'Button and input components', parentId: w.ds.id });
  w.cms = await task('maya', { title: 'Choose the CMS', projectId: web, priority: 2, dueDate: day(1), categoryId: cat.Work, labels: ['dev', 'research'], assigneeId: ids.sara, description: 'Compare Strapi, Sanity and a static site. Must support French and English.' });
  w.setup = await task('maya', { title: 'Set up staging environment', projectId: web, priority: 3, dueDate: day(3), labels: ['dev'], assigneeId: ids.sara });
  for (const s of ['Domain and HTTPS', 'CI pipeline', 'Seed content']) await task('sara', { title: s, parentId: w.setup.id });
  w.copy = await task('maya', { title: 'Write homepage copy', projectId: web, priority: 2, dueDate: day(4), categoryId: cat.Client, labels: ['waiting'], deadline: at(6, 12) });
  w.photos = await task('maya', { title: 'Book the photo shoot', projectId: web, priority: 3, dueDate: day(6), categoryId: cat.Errands });
  w.seo = await task('maya', { title: 'SEO redirects from old URLs', projectId: web, priority: 3, dueDate: day(9), labels: ['dev'], assigneeId: ids.sara });
  w.a11y = await task('maya', { title: 'Accessibility review', projectId: web, priority: 2, dueDate: day(10), labels: ['design', 'dev'], deadline: at(12, 17) });
  w.analytics = await task('maya', { title: 'Privacy-friendly analytics', projectId: web, priority: 4, labels: ['dev'] });
  w.launch = await task('maya', { title: 'Launch checklist', projectId: web, priority: 1, dueDate: day(14), categoryId: cat.Work, deadline: at(15, 9) });
  for (const s of ['Final QA on all browsers', 'Client walkthrough', 'Switch DNS', 'Announce on social']) await task('maya', { title: s, parentId: w.launch.id });
  w.retainer = await task('maya', { title: 'Send maintenance retainer proposal', projectId: web, priority: 3, categoryId: cat.Client, labels: ['client'] });
  // Overdue with a passed deadline (shows a "Deadline passed" notification).
  w.invoice = await task('maya', { title: 'Invoice the first milestone', projectId: web, priority: 1, dueDate: day(-1), categoryId: cat.Client, deadline: at(-1, 17), labels: ['client'] });
  await done('maya', w.audit.id);
  await done('maya', w.brief.id);

  await comment('leo', w.wire.id, '@Maya first pass is in Figma, pricing still needs a second option.');
  await comment('maya', w.wire.id, 'Looks great! @Leo can you also try a version with the testimonials higher up?');
  await comment('omar', w.wire.id, 'Love the direction. Our logo should be a bit bigger on mobile.');
  await comment('sara', w.cms.id, 'Leaning towards Sanity: good i18n and the free plan covers us. Writing up the comparison today.');
  await comment('leo', w.ds.id, 'Using the Doable palette as a starting point, will share tokens tomorrow.');
  await api('leo', 'PATCH', `/tasks/${w.wire.id}`, { priority: 1, description: 'Figma: Website / Wireframes v1. Include empty and error states.' });

  console.log('Mobile App Launch…');
  const a = {};
  a.beta = await task('maya', { title: 'Recruit 20 beta testers', projectId: app, priority: 2, dueDate: day(1), categoryId: cat.Work, assigneeId: ids.maya });
  a.store = await task('sara', { title: 'App Store screenshots and listing', projectId: app, priority: 2, dueDate: day(5), labels: ['design'], assigneeId: ids.leo, deadline: at(7, 12) });
  for (const s of ['iPhone 6.7" screenshots', 'iPad screenshots', 'Short description (80 chars)']) await task('leo', { title: s, parentId: a.store.id });
  a.crash = await task('sara', { title: 'Fix crash on Android 12 when offline', projectId: app, priority: 1, dueDate: day(0), labels: ['dev', 'urgent'], assigneeId: ids.sara });
  a.push = await task('sara', { title: 'Push notification opt-in screen', projectId: app, priority: 3, dueDate: day(4), labels: ['dev', 'design'] });
  a.pricing = await task('maya', { title: 'Decide launch pricing', projectId: app, priority: 1, dueDate: day(2), categoryId: cat.Work, labels: ['meeting'] });
  a.press = await task('maya', { title: 'Press kit', projectId: app, priority: 3, dueDate: day(8) });
  a.done1 = await task('sara', { title: 'Set up crash reporting', projectId: app, priority: 2 });
  await done('sara', a.done1.id);
  await comment('sara', a.crash.id, 'Reproduced: the sync job runs before the cache is ready. Fix on the way.');
  await comment('maya', a.pricing.id, '@Sara can you pull the numbers from the beta survey before Thursday?');

  console.log('Q4 Marketing, personal projects…');
  const m1 = await task('maya', { title: 'Plan the Q4 newsletter', projectId: mkt, priority: 2, dueDate: day(3), categoryId: cat.Work, assigneeId: ids.leo });
  for (const s of ['Pick 3 case studies', 'Draft subject lines', 'Schedule send']) await task('maya', { title: s, parentId: m1.id });
  await task('maya', { title: 'Webinar with a client', projectId: mkt, priority: 3, dueDate: day(12), labels: ['client'] });
  await task('maya', { title: 'Refresh LinkedIn page', projectId: mkt, priority: 4, categoryId: cat.Work });
  await task('maya', { title: 'Weekly team sync', projectId: mkt, recurrence: 'every monday', dueTime: '10:00', durationMinutes: 30, labels: ['meeting'] });

  await task('maya', { title: 'Call the landlord about the heating', projectId: home, priority: 1, dueDate: day(0), categoryId: cat.Personal });
  await task('maya', { title: 'Water the plants', projectId: home, recurrence: 'every 3 days', categoryId: cat.Personal });
  await task('maya', { title: 'Groceries', projectId: home, dueDate: day(1), categoryId: cat.Errands, description: 'Oat milk, coffee, lemons, bread' });
  await task('maya', { title: 'Book dentist appointment', projectId: home, priority: 3, dueDate: day(-3), categoryId: cat.Health });
  await task('maya', { title: 'Renew passport', projectId: home, priority: 2, deadline: at(20, 12), categoryId: cat.Errands });
  await task('maya', { title: 'Morning run', projectId: home, recurrence: 'every weekday', dueTime: '07:00', categoryId: cat.Health });
  const r1 = await task('maya', { title: 'Shape Up by Ryan Singer', projectId: reading, categoryId: cat.Learning });
  await task('maya', { title: 'Refactoring UI', projectId: reading, categoryId: cat.Learning });
  await task('maya', { title: 'The Design of Everyday Things', projectId: reading, categoryId: cat.Learning });
  await done('maya', r1.id);
  await task('maya', { title: 'Export old intranet pages', projectId: intranet });
  await api('maya', 'PUT', `/projects/${intranet}`, { archived: true });

  // Inbox
  await task('maya', { title: 'Reply to Sam about the conference talk', priority: 2, dueDate: day(0), dueTime: '17:30' });
  await task('maya', { title: 'Ideas: dark mode for the client portal', labels: ['design'] });
  await task('maya', { title: 'Expense report for September', priority: 3, dueDate: day(2), categoryId: cat.Work, deadline: at(5, 18) });

  console.log('Leo, Sara and Ines’s own projects…');
  const ds = (await api('leo', 'POST', '/projects', { name: 'Design system', color: 'plum', favorite: true })).id;
  const dsTask = await task('leo', { title: 'Icon set audit', projectId: ds, priority: 2, dueDate: day(1), categoryId: leoCat.Design });
  for (const s of ['Remove duplicates', 'Align stroke widths', 'Export SVG sprite']) await task('leo', { title: s, parentId: dsTask.id });
  await task('leo', { title: 'Submit holiday request', dueDate: day(2), categoryId: leoCat.Admin });
  const sprint = (await api('sara', 'POST', '/projects', { name: 'Sprint 14', color: 'sky' })).id;
  await task('sara', { title: 'Upgrade to Angular 20', projectId: sprint, priority: 2, dueDate: day(2), labels: ['dev'] });
  await task('sara', { title: 'Code review: payments', projectId: sprint, priority: 1, dueDate: day(0), labels: ['dev', 'urgent'] });

  const thesis = (await api('ines', 'POST', '/projects', { name: 'Master thesis', color: 'sky', favorite: true })).id;
  const ch = await task('ines', { title: 'Chapter 2: literature review', projectId: thesis, priority: 1, dueDate: day(4), categoryId: inesCat.University, deadline: at(9, 23, 59) });
  for (const s of ['Read 5 more papers', 'Write the summary table', 'Send to supervisor']) await task('ines', { title: s, parentId: ch.id });
  await task('ines', { title: 'Book a meeting with Prof. Laurent', projectId: thesis, dueDate: day(1), categoryId: inesCat.University });
  const trip = (await api('ines', 'POST', '/projects', { name: 'Trip to Lisbon', color: 'sun' })).id;
  await task('ines', { title: 'Book flights', projectId: trip, priority: 1, dueDate: day(2), categoryId: inesCat.Travel });
  await task('ines', { title: 'Find a place near Alfama', projectId: trip, dueDate: day(3), categoryId: inesCat.Travel });
  // Ines invites Maya: shows up as an invitation in Maya's bell.
  await api('ines', 'POST', `/projects/${trip}/invites`, { email: people.maya.email, role: 'MEMBER' });

  console.log('\nDone! Every account uses the password: ' + PASSWORD);
  for (const p of Object.values(people)) console.log(`  ${p.email.padEnd(24)} ${p.name}`);
}

main().catch((e) => {
  console.error('Seeding failed:', e.message);
  process.exit(1);
});
