import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '/tmp/shots';
const BASE = 'http://127.0.0.1:5199';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({
  viewport: { width: 900, height: 1000 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  else console.log(`  console: ${m.text()}`);
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

const open = async (query) => {
  await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#team-name');
  await page.waitForTimeout(400);
};

const inviteValues = () =>
  page.$$eval('input[id^="invite-"]', (els) => els.map((e) => e.value));

// 1. The new default: same-domain teammates already in the list.
await open('?scenario=prefill');
console.log('prefilled rows:', await inviteValues());
console.log('cta:', await page.textContent('button:has-text("Create team")'));
await shot('01-prefilled-light');
console.log(
  'remove buttons:',
  await page.$$eval('button[aria-label^="Don\'t invite"]', (e) => e.length),
  'of',
  (await inviteValues()).length,
  'rows'
);
console.log('page scrollable:', await page.evaluate(() => document.body.scrollHeight > window.innerHeight));

// 2. Hover state on a remove button.
await page.hover('button[aria-label="Don\'t invite tom@macro.com"]');
await page.waitForTimeout(200);
await shot('02-remove-hover');

// 3. Two teammates removed — the X actually drops the right rows.
await page.click('button[aria-label="Don\'t invite tom@macro.com"]');
await page.click('button[aria-label="Don\'t invite ade@macro.com"]');
await page.waitForTimeout(200);
console.log('after removing 2:', await inviteValues());
console.log('cta:', await page.textContent('button:has-text("Create team")'));
await shot('03-after-removing-two');

// 4. Typing into the trailing empty row still works, and the row grows an X.
const slots = await page.$$('input[id^="invite-"]');
await slots[slots.length - 1].fill('newhire@macro.com');
await page.waitForTimeout(200);
console.log('after typing:', await inviteValues());
await shot('04-typed-into-empty-row');

// 5. What actually gets submitted (logged by the mocked mutation).
const submitted = [];
page.on('console', (m) => {
  if (m.text().startsWith('[create-team]')) submitted.push(m.text());
  if (m.text().startsWith('[analytics]')) submitted.push(m.text());
});
await page.click('button:has-text("Create team")');
await page.waitForTimeout(500);
console.log('submitted:', submitted.join('\n            '));

// 6. Dark theme.
await open('?scenario=prefill&theme=dark');
await shot('05-prefilled-dark');

// 7. Personal-email user: no domain, no prefill, plain two-slot form.
await open('?scenario=plain');
console.log('plain rows:', await inviteValues());
console.log(
  'remove buttons on empty form:',
  await page.$$eval('button[aria-label^="Remove"]', (e) => e.length),
  '/ dont-invite buttons:',
  await page.$$eval('button[aria-label^="Don\'t invite"]', (e) => e.length)
);
await shot('06-personal-email-plain');

// 8. Plain form, one address typed by hand — X appears only on that row.
await page.fill('#invite-0', 'someone@elsewhere.com');
await page.waitForTimeout(200);
console.log(
  'after typing one:',
  await page.$$eval('button[aria-label^="Don\'t invite"]', (e) =>
    e.map((b) => b.getAttribute('aria-label'))
  )
);
await shot('07-plain-typed-one');

await browser.close();
if (errors.length) {
  console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nno page errors');
