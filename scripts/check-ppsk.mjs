import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const project = JSON.parse(
  readFileSync(new URL('../src/tests/fixtures/ppskNetwork.json', import.meta.url), 'utf8'),
);
let server, browser, page;
const errors = [];
const dialog = () => page.getByRole('dialog').last();
async function open(name) {
  await page.locator('.layer-list > button').filter({ hasText: name }).first().dblclick();
  await dialog().waitFor();
}
async function save() {
  await dialog().getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
}
async function printerVlan(vlan) {
  await page.waitForFunction((vlan) => {
    const n = JSON.parse(localStorage.getItem('netweave-project'));
    const d = n.devices.find((d) => d.name === 'Drukarka');
    return vlan ? d.vlan === vlan && d.lease?.vlan === vlan : !d.ip && !d.lease;
  }, vlan);
}
try {
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4181', '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(Error(`Vite did not start: ${output}`)), 15000);
    const ready = (data) => {
      output += data.toString();
      if (output.includes('127.0.0.1:4181')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', ready);
    server.stderr.on('data', ready);
    server.once('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(Error(`Vite exited (${code}): ${output}`));
    });
  });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((project) => {
    if (!localStorage.getItem('netweave-project'))
      localStorage.setItem('netweave-project', JSON.stringify(project));
  }, project);
  await page.goto('http://127.0.0.1:4181');
  await page.locator('.network-device').first().waitFor();
  await printerVlan(30);
  await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
  await open('AP PPSK');
  const primary = () => dialog().locator('.ppsk-editor').first();
  assert(await primary().getByRole('checkbox').first().isChecked());
  assert.equal(await primary().locator('.radius-entry').count(), 2);
  assert(
    !(await dialog().locator('.ppsk-editor').nth(1).getByRole('checkbox').first().isChecked()),
  );
  await primary().getByRole('button', { name: 'Dodaj hasło PPSK', exact: true }).click();
  assert.equal(await primary().locator('.radius-entry').count(), 3);
  await primary()
    .locator('.radius-entry')
    .last()
    .getByRole('button', { name: 'Usuń hasło PPSK', exact: true })
    .click();
  const printKey = () =>
    primary()
      .locator('.radius-entry')
      .filter({ has: page.locator('legend').filter({ hasText: /^Drukarki$/ }) });
  await printKey().getByLabel('Hasło PPSK', { exact: true }).fill('lab-printer-rotated-123');
  await page.screenshot({ path: '/tmp/netweave-ppsk-ap.png' });
  await save();
  await printerVlan(0);
  console.log(
    'PASS AP PPSK editor: profiles per SSID; rotated key rejects a previously leased client',
  );
  await open('Drukarka');
  const password = () => dialog().getByLabel('Hasło Wi-Fi / PPSK · wlan0', { exact: true });
  await password().fill('lab-staff-test-123');
  assert((await dialog().getByRole('status').innerText()).includes('VLAN 10'));
  await save();
  await printerVlan(10);
  await open('Drukarka');
  await password().fill('lab-printer-rotated-123');
  assert((await dialog().getByRole('status').innerText()).includes('VLAN 30'));
  await page.screenshot({ path: '/tmp/netweave-ppsk-client.png' });
  await save();
  await printerVlan(30);
  console.log(
    'PASS client PPSK editor: password changes VLAN and DHCP; form saves the effective VLAN',
  );
  await open('AP PPSK');
  await printKey().getByLabel('Hasło aktywne', { exact: true }).uncheck();
  await save();
  await printerVlan(0);
  await open('AP PPSK');
  await printKey().getByLabel('Hasło aktywne', { exact: true }).check();
  await save();
  await printerVlan(30);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('netweave-project')));
  assert.equal(saved.devices.find((d) => d.name === 'Gość').lease.vlan, 15);
  assert.equal(saved.devices.find((d) => d.name === 'Pracownik').lease.vlan, 10);
  await page.reload();
  await page.locator('.network-device').first().waitFor();
  await printerVlan(30);
  await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
  await open('AP PPSK');
  await page.setViewportSize({ width: 390, height: 1000 });
  assert(
    await dialog().evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    'PPSK form must fit mobile width',
  );
  await page.screenshot({ path: '/tmp/netweave-ppsk-390.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PPSK UI PASSED: key disable/enable, independent guest SSID, persistence and 390px layout',
  );
} catch (error) {
  await page
    ?.screenshot({ path: '/tmp/netweave-ppsk-failure.png', fullPage: true })
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
