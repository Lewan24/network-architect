import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4182', '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Vite timeout')), 15000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('4182')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('exit', (c) => {
      clearTimeout(timer);
      reject(Error(`Vite exited ${c}`));
    });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4182');
  await page.locator('.network-device').first().waitFor();
  await page.getByRole('button', { name: 'Dodaj tekst', exact: true }).click();
  await page.getByLabel('Treść etykiety').fill('Firma ABC\nWarszawa');
  await page.getByRole('button', { name: 'Zapisz tekst', exact: true }).click();
  const label = page.locator('.canvas-text');
  await label.waitFor();
  assert.match(await label.textContent(), /Firma ABC/);
  const before = await label.getAttribute('transform');
  await label.focus();
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await label.getAttribute('transform'), before);
  await label.dblclick();
  await page.getByLabel('Treść etykiety').fill('Firma XYZ');
  await page.getByRole('button', { name: 'Zapisz tekst', exact: true }).click();
  assert.match(await label.textContent(), /Firma XYZ/);
  await page.getByRole('button', { name: 'Sieci i VLAN-y', exact: true }).click();
  await page.locator('.vlan-card').first().click();
  const editor = page.getByRole('dialog').last();
  await editor.locator('.vlan-removal-info').waitFor();
  assert.equal(
    await editor.getByRole('button', { name: 'Usuń sieć', exact: true }).isEnabled(),
    true,
  );
  await editor.getByRole('button', { name: 'Usuń sieć', exact: true }).click();
  assert.equal(await page.locator('.vlan-card').count(), 6);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('netweave-project')));
  assert.equal(stored.vlans.length, 6);
  assert.equal(stored.annotations[0].text, 'Firma XYZ');
  await page.reload();
  await page.locator('.canvas-text').waitFor();
  assert.match(await page.locator('.canvas-text').textContent(), /Firma XYZ/);
  await page.screenshot({ path: '/tmp/netweave-text-vlan.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: create/edit/move/save canvas text, remove occupied VLAN and reload project');
} finally {
  await browser?.close();
  server.kill();
}
