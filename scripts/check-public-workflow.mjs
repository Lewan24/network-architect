import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4181', '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Vite timeout')), 15000);
    server.stdout.on('data', (data) => {
      if (String(data).includes('4181')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(Error(`Vite exited ${code}`));
    });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4181');
  await page.locator('.network-device').first().waitFor();
  await page.getByRole('button', { name: 'Symulacja', exact: true }).click();
  await page.getByPlaceholder('Np. Kamera ma dostęp do NVR').fill('Test regresji dostępu');
  await page.getByRole('button', { name: 'Zapisz aktualny test', exact: true }).click();
  assert.equal(await page.locator('.simulation-sidebar .custom-scenario-card').count(), 0);
  await page.getByRole('button', { name: 'Zapisane testy (1)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Testuj', exact: true }).click();
  await dialog.locator('.custom-scenario-result').waitFor();
  await dialog.getByRole('button', { name: 'Sprawdź wszystkie', exact: true }).click();
  assert.match(await dialog.getByRole('status').innerText(), /1\/1/);
  await page.screenshot({ path: '/tmp/netweave-saved-scenarios.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Zamknij symulację', exact: true }).click();
  await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
  await page
    .locator('.layer-list > button')
    .filter({ hasText: 'DNS · lab.home.arpa' })
    .first()
    .dblclick();
  await dialog.getByRole('button', { name: 'Rekordy DNS', exact: true }).click();
  await dialog.getByLabel('Publiczny serwer DNS', { exact: true }).check();
  await page.screenshot({ path: '/tmp/netweave-public-dns.png' });
  await page.keyboard.press('Escape');
  await page.locator('.layer-list > button').filter({ hasText: 'Docker' }).first().dblclick();
  await dialog.getByRole('button', { name: 'Usługi', exact: true }).click();
  const service = dialog.locator('.service-card').first();
  await service.getByLabel('Typ usługi', { exact: true }).selectOption('proxy');
  await service.getByRole('button', { name: 'Dodaj host', exact: true }).click();
  await service.getByLabel('Domena', { exact: true }).fill('app.example.com');
  await service.getByLabel('Docelowy IPv4 lub DNS', { exact: true }).fill('192.168.20.10');
  await page.screenshot({ path: '/tmp/netweave-proxy.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: saved scenarios dialog, individual/batch execution, public DNS controls, reverse proxy configuration',
  );
} finally {
  await browser?.close();
  server.kill();
}
