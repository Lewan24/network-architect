import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// An isolated browser profile: never reads or clears the user's saved project.
const preview = process.argv.includes('--preview');
const url = process.env.NETWEAVE_TEST_URL || 'http://127.0.0.1:4180';
let server;
let browser;
let page;
const errors = [];
async function visible(locator) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'Control must have visible dimensions');
}
async function inViewport(locator) {
  await visible(locator);
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert(
    box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    `Control outside viewport: ${await locator.innerText()}`,
  );
}
const dialog = () => page.getByRole('dialog').last();
const cancel = () => dialog().getByRole('button', { name: 'Anuluj', exact: true }).click();
async function savedProject() {
  await page.waitForFunction(() => localStorage.getItem('netweave-project'));
  return page.evaluate(() => JSON.parse(localStorage.getItem('netweave-project')));
}
async function tabsFit() {
  assert(
    await dialog()
      .locator('.config-tabs')
      .evaluate((nav) => nav.scrollWidth <= nav.clientWidth + 1),
    'Device tabs must wrap instead of hiding sections horizontally',
  );
  for (const tab of await dialog().locator('.config-tabs button').all()) await inViewport(tab);
}
try {
  if (!process.env.NETWEAVE_TEST_URL) {
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        ...(preview ? ['preview'] : []),
        '--host',
        '127.0.0.1',
        '--port',
        '4180',
        '--strictPort',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(Error(`Vite did not start: ${output}`)), 15000);
      const ready = (data) => {
        output += data.toString();
        if (output.includes('127.0.0.1:4180')) {
          clearTimeout(timeout);
          resolve();
        }
      };
      server.stdout.on('data', ready);
      server.stderr.on('data', ready);
      server.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once('exit', (code) => {
        clearTimeout(timeout);
        reject(Error(`Vite exited (${code}): ${output}`));
      });
    });
  }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  await page.locator('.network-device').first().waitFor();
  const original = await savedProject();
  assert.equal(original.devices.length, 22);

  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const name of ['Diagnostyka', 'Sieci i VLAN-y', 'Symulacja', 'Pomoc'])
      await inViewport(page.getByRole('button', { name, exact: true }));
    await visible(page.locator('.diagnostics-button > span'));
    await page.getByRole('button', { name: 'Diagnostyka', exact: true }).click();
    await visible(dialog().getByRole('heading', { name: 'Diagnostyka projektu' }));
    assert.equal(await dialog().locator('.diagnostic-item').count(), 0);
    await dialog().getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.getByRole('button', { name: 'Symulacja', exact: true }).click();
    await inViewport(page.getByRole('button', { name: 'Zamknij symulację', exact: true }));
    await page.getByRole('button', { name: 'Diagnostyka', exact: true }).click();
    await dialog().getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.getByRole('button', { name: 'Zamknij symulację', exact: true }).click();
    await page.screenshot({ path: `/tmp/netweave-ui-${width}.png` });
    await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
    await page
      .locator('.layer-list > button')
      .filter({ hasText: 'Router brzegowy' })
      .filter({ hasNot: page.locator('small', { hasText: '↔' }) })
      .first()
      .dblclick();
    await tabsFit();
    await dialog().getByRole('button', { name: 'Porty i PoE', exact: true }).click();
    await visible(dialog().getByLabel('Port włączony', { exact: true }));
    await cancel();
    console.log(`PASS ${width}px: navigation, diagnostics, device tabs and port controls`);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Urządzenia', exact: true }).click();
  const tiles = page.locator('.device-tile');
  assert.equal(await tiles.count(), 15);
  for (let index = 0; index < (await tiles.count()); index++) {
    const tile = tiles.nth(index);
    const name = await tile.locator('strong').innerText();
    await tile.click();
    if (!(await page.getByRole('dialog').count()))
      await page
        .locator('.selection-actions')
        .getByRole('button', { name: 'Edytuj', exact: true })
        .click();
    await tabsFit();
    const tabs = await dialog().locator('.config-tabs button').allTextContents();
    assert(tabs.includes('Porty i PoE'));
    assert.equal(
      tabs.includes('Interfejsy IP'),
      !['Internet', 'Switch L2', 'Switch prosty', 'AP Wi-Fi'].includes(name),
      `Expected IP section for ${name}`,
    );
    for (const tab of tabs) {
      await dialog()
        .locator('.config-tabs')
        .getByRole('button', { name: tab, exact: true })
        .click();
      assert(
        (await dialog().locator('.dialog-body').innerText()).trim().length,
        `Empty section: ${name}/${tab}`,
      );
    }
    await dialog().getByRole('button', { name: 'Porty i PoE', exact: true }).click();
    await visible(dialog().getByLabel('Gniazdo / medium'));
    await visible(dialog().getByLabel('Prędkość administracyjna'));
    await visible(dialog().getByLabel('Łączny budżet PSE urządzenia (W)'));
    await dialog().getByLabel('Gniazdo / medium').selectOption('sfp+');
    await visible(dialog().getByLabel('Moduł optyczny (niepotrzebny dla DAC)'));
    await dialog().getByLabel('Tryb VLAN tego końca').selectOption('trunk');
    await visible(dialog().getByLabel('Native VLAN / PVID'));
    await visible(dialog().getByLabel('Taguj również native VLAN przy nadawaniu'));
    await dialog().getByLabel('Tryb VLAN tego końca').selectOption('access');
    await visible(dialog().getByLabel('VLAN access / PVID'));
    await dialog().getByLabel('Zasilanie tego urządzenia').selectOption('poe');
    await visible(dialog().getByLabel('Wymagana moc przy odbiorniku PD (W)'));
    if (tabs.includes('Interfejsy IP')) {
      await dialog().getByRole('button', { name: 'Interfejsy IP', exact: true }).click();
      await dialog().getByLabel('Adresowanie').selectOption('static');
      await visible(dialog().getByLabel('Prefiks maski'));
      await visible(dialog().getByLabel('Brama domyślna tej karty — pusta dla sieci lokalnej'));
      await visible(dialog().getByLabel('Metryka trasy — niższa wygrywa'));
    }
    await cancel();
    console.log(`PASS device: ${name} (${tabs.length} sections)`);
  }

  // Reload the original demo in a fresh context for mutation/undo and simulation checks.
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(
    (project) => localStorage.setItem('netweave-project', JSON.stringify(project)),
    original,
  );
  await page.goto(url);
  await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
  await page
    .locator('.layer-list > button')
    .filter({ hasText: 'Stanowisko administratora' })
    .first()
    .click();
  await page
    .locator('.selection-actions')
    .getByRole('button', { name: 'Interfejsy IP', exact: true })
    .click();
  await visible(dialog().getByRole('heading', { name: 'Interfejsy IP i adresacja' }));
  await cancel();
  await page
    .locator('.selection-actions')
    .getByRole('button', { name: 'Porty i PoE', exact: true })
    .click();
  await dialog().getByLabel('Port włączony', { exact: true }).uncheck();
  await cancel();
  assert.equal(
    (await savedProject()).devices.find((d) => d.id === 'demo-pc').ports[0].enabled,
    true,
  );

  const cableRow = page.getByRole('button', { name: /^Połączenie:/ }).first();
  await cableRow.focus();
  await cableRow.press('Enter');
  await visible(dialog().getByRole('heading', { name: 'Porty i połączenie' }));
  for (const endpoint of await dialog().locator('.link-endpoint').all()) {
    await visible(endpoint.locator('.port-panel'));
    assert((await endpoint.locator('.port-slot').count()) > 0);
    await visible(endpoint.getByLabel('Tryb VLAN tego końca'));
  }
  await dialog().getByLabel('Etykieta kabla').fill('UI-CABLE');
  await dialog().getByLabel('Długość całego toru (m), razem z patchcordami').fill('101');
  await dialog().getByRole('button', { name: 'Zapisz porty i kabel', exact: true }).click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('netweave-project')).links.some((l) => l.label === 'UI-CABLE'),
  );
  await page.getByRole('button', { name: 'Diagnostyka', exact: true }).click();
  const issue = dialog()
    .locator('.diagnostic-item')
    .filter({ hasText: 'Kanał skrętki przekracza 100 m.' })
    .first();
  await issue.getByRole('button', { name: 'Otwórz konfigurację' }).click();
  await visible(dialog().getByRole('heading', { name: 'Porty i połączenie' }));
  await cancel();
  await page.getByRole('button', { name: 'Cofnij', exact: true }).click();
  await page.waitForFunction(
    () =>
      !JSON.parse(localStorage.getItem('netweave-project')).links.some(
        (l) => l.label === 'UI-CABLE',
      ),
  );
  console.log(
    'PASS cable: object list/keyboard access, endpoints, save, diagnostics navigation, undo',
  );

  await page.getByRole('button', { name: 'Symulacja', exact: true }).click();
  await page.getByLabel('Źródło', { exact: true }).selectOption('demo-pc');
  await page.getByLabel('Cel komunikacji', { exact: true }).selectOption('demo-dns');
  await visible(page.getByLabel('Interfejs źródła', { exact: true }));
  await visible(page.getByLabel('Interfejs celu', { exact: true }));
  await page.getByRole('button', { name: 'Konfiguruj interfejsy źródła' }).click();
  await visible(dialog().getByRole('heading', { name: 'Interfejsy IP i adresacja' }));
  await dialog().getByRole('button', { name: 'Włącz osobną konfigurację kart' }).click();
  await dialog().getByRole('button', { name: 'Dodaj kartę', exact: true }).click();
  assert.equal(await dialog().locator('.interface-card').count(), 2);
  await dialog()
    .getByRole('button', { name: /Zapisz/ })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('netweave-project')).devices.find((d) => d.id === 'demo-pc')
        .interfaces?.length === 2,
  );
  assert.equal(
    await page.getByLabel('Interfejs źródła', { exact: true }).locator('option').count(),
    3,
  );
  await page.getByRole('slider', { name: 'Tempo animacji', exact: true }).focus();
  await page.getByRole('slider', { name: 'Tempo animacji', exact: true }).press('End');
  await page.getByRole('button', { name: 'Wyślij pakiet' }).click();
  await page.getByRole('button', { name: 'Diagnostyka', exact: true }).click();
  await visible(dialog().getByRole('heading', { name: 'Ostatni zakończony test' }));
  await dialog().getByText('Decyzje na ścieżce, reguły ACL i NAT', { exact: true }).click();
  assert((await dialog().locator('.diagnostic-trace li').count()) > 0);
  console.log(
    'PASS simulation: default and multiple NICs, direct configuration, completed packet trace',
  );
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const legacy = structuredClone(original);
  for (const device of legacy.devices) {
    for (const key of ['ports', 'interfaces', 'powerSource', 'powerWatts', 'poeBudgetWatts'])
      delete device[key];
  }
  for (const link of legacy.links) {
    for (const key of ['aPortId', 'bPortId', 'cable', 'lengthMeters']) delete link[key];
  }
  await page.addInitScript(
    (project) => localStorage.setItem('netweave-project', JSON.stringify(project)),
    legacy,
  );
  await page.goto(url);
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('netweave-project')).devices.every(
      (device) => device.ports?.length,
    ),
  );
  await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
  await page
    .locator('.layer-list > button')
    .filter({ hasText: 'Stanowisko administratora' })
    .first()
    .dblclick();
  await dialog().getByRole('button', { name: 'Porty i PoE', exact: true }).click();
  await visible(dialog().getByLabel('Port włączony', { exact: true }));
  await dialog().getByRole('button', { name: 'Interfejsy IP', exact: true }).click();
  await visible(dialog().getByRole('heading', { name: 'Interfejsy IP i adresacja' }));
  console.log('PASS startup migration: saved project without ports or explicit NICs');
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const patching = structuredClone(original);
  const sw = patching.devices.find((d) => d.id === 'demo-lan-switch');
  sw.ports.find((p) => p.id === 'eth20').enabled = false;
  const pc = patching.devices.find((d) => d.id === 'demo-pc');
  pc.ports.push({ ...pc.ports.find((p) => p.id === 'eth0'), id: 'eth-extra', name: 'eth-extra' });
  await page.addInitScript(
    (project) => localStorage.setItem('netweave-project', JSON.stringify(project)),
    patching,
  );
  await page.goto(url);
  const switchNode = page.getByRole('button', { name: /^Switch biurowy,/ });
  const pcNode = page.getByRole('button', { name: /^Stanowisko administratora,/ });
  await switchNode.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Połącz z urządzeniem', exact: true }).click();
  await visible(dialog().getByRole('heading', { name: 'Wybierz port początkowy' }));
  assert((await dialog().locator('.port-slot.up').count()) > 0);
  assert(await dialog().locator('[data-port-id="eth20"]').isDisabled());
  assert(
    (await dialog().locator('[data-port-id="eth20"]').getAttribute('class')).includes('disabled'),
  );
  assert.equal(
    await dialog()
      .locator('[data-port-id="eth20"] .port-jack')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(21, 25, 31)',
  );
  assert.equal(
    await dialog()
      .locator('[data-port-id="eth10"] .port-jack')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(133, 142, 156)',
  );
  assert.equal(
    await dialog()
      .locator('.port-slot.up .port-jack')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(37, 139, 97)',
  );
  await page.screenshot({ path: '/tmp/netweave-ui-front-panel.png' });
  await dialog().locator('[data-port-id="eth10"]').click();
  await visible(page.locator('.connection-instruction'));
  assert((await page.locator('.connection-instruction').innerText()).includes('eth10'));
  assert.equal((await savedProject()).links.length, original.links.length);
  await pcNode.click();
  await visible(dialog().getByRole('heading', { name: 'Wybierz port docelowy' }));
  assert(await dialog().locator('[data-port-id="eth0"]').isDisabled());
  assert(await dialog().locator('[data-port-id="wlan0"]').isDisabled());
  await dialog().locator('[data-port-id="eth-extra"]').click();
  await dialog().getByLabel('Medium nowego połączenia').selectOption('cat6a');
  await dialog().getByLabel('Długość nowego kabla (m)').fill('12');
  await page.screenshot({ path: '/tmp/netweave-ui-connect.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog()
    .getByRole('button', { name: 'Połącz wybrane porty', exact: true })
    .scrollIntoViewIfNeeded();
  await inViewport(dialog().getByRole('button', { name: 'Połącz wybrane porty', exact: true }));
  await page.screenshot({ path: '/tmp/netweave-ui-connect-mobile.png' });

  await dialog().getByRole('button', { name: 'Połącz wybrane porty', exact: true }).click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('netweave-project')).links.some(
      (l) =>
        l.a === 'demo-lan-switch' &&
        l.aPortId === 'eth10' &&
        l.b === 'demo-pc' &&
        l.bPortId === 'eth-extra' &&
        l.cable === 'cat6a' &&
        l.lengthMeters === 12,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('.selection-actions')
    .getByRole('button', { name: 'Porty i PoE', exact: true })
    .click();
  assert(
    (await dialog().locator('[data-port-id="eth-extra"]').getAttribute('class')).includes(' up '),
  );
  await dialog().locator('[data-port-id="eth-extra"]').click();
  assert.equal(await dialog().getByLabel('Nazwa portu').inputValue(), 'eth-extra');
  await cancel();
  // Cancellation must not reserve sockets or create a half-finished cable.
  await switchNode.click();
  await page
    .locator('.selection-actions')
    .getByRole('button', { name: 'Połącz urządzenie', exact: true })
    .click();
  await dialog().locator('[data-port-id="eth11"]').click();
  await pcNode.click();
  await dialog().getByRole('button', { name: 'Wróć do wyboru urządzenia' }).click();
  await page.getByRole('button', { name: 'Anuluj łączenie', exact: true }).click();
  assert.equal((await savedProject()).links.length, original.links.length + 1);
  assert.equal(await page.locator('.connection-instruction').count(), 0);
  // C + clicks supports the same flow, including SFP+ cages and inferred DAC.
  await page.getByRole('button', { name: 'Połącz urządzenia', exact: true }).click();
  await switchNode.click();
  await dialog().locator('[data-port-id="sfp0"]').click();
  await page.getByRole('button', { name: /^Switch serwerowy,/ }).click();
  await dialog().locator('[data-port-id="sfp1"]').click();
  assert.equal(await dialog().getByLabel('Medium nowego połączenia').inputValue(), 'dac');
  await dialog().getByRole('button', { name: 'Połącz wybrane porty', exact: true }).click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('netweave-project')).links.some(
      (l) => l.aPortId === 'sfp0' && l.bPortId === 'sfp1' && l.cable === 'dac',
    ),
  );
  // VM attachment never consumes a physical socket on the hypervisor.
  await page.getByRole('button', { name: 'Połącz urządzenia', exact: true }).click();
  await page.getByRole('button', { name: /^Docker · Nginx Proxy Manager,/ }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: /^Hyper-V · host,/ }).click();
  assert.equal(await page.locator('.connection-instruction').count(), 0);
  await page.screenshot({ path: '/tmp/netweave-ui-port-flow.png' });
  console.log(
    'PASS front panels and connection flow: socket states, explicit A/B ports, media, cancellation, DAC, VM',
  );
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Przykładowe projekty', exact: true }).click();
  await page.getByRole('button', { name: /Biuro, serwery i Wi-Fi/ }).click();
  await page.getByRole('button', { name: /^Drukarka · pracownicy,/ }).waitFor();
  await page.screenshot({ path: '/tmp/netweave-demo-layout.png' });
  await page.getByRole('button', { name: 'Obiekty', exact: true }).click();
  await page
    .locator('.layer-list > button')
    .filter({ hasText: 'Switch PoE · kamery' })
    .first()
    .dblclick();
  await dialog().getByRole('button', { name: 'Porty i PoE', exact: true }).click();
  assert.equal(await dialog().getByLabel('Łączny budżet PSE urządzenia (W)').inputValue(), '60');
  assert((await dialog().innerText()).includes('Alokacja 30.8 W'));
  assert.equal(await dialog().locator('.port-slot.up').count(), 3);
  await page.screenshot({ path: '/tmp/netweave-demo-poe.png' });
  await cancel();
  await page.getByRole('button', { name: 'Symulacja', exact: true }).click();
  const scenarios = page.getByLabel('Scenariusz przykładowej sieci');
  assert.equal(await scenarios.locator('option').count(), 25);
  await page.getByRole('slider', { name: 'Tempo animacji', exact: true }).focus();
  await page.getByRole('slider', { name: 'Tempo animacji', exact: true }).press('End');
  for (const [id, expected] of [
    ['staff-ipp', true],
    ['wired-ipp', true],
    ['guest-printer-denied', false],
    ['recording', true],
    ['recording-camera2', true],
    ['staff-cctv-denied', false],
  ]) {
    await scenarios.selectOption(id);
    await page.getByRole('button', { name: 'Wyślij pakiet', exact: true }).click();
    await page.locator('.sim-section-heading > .pending').waitFor({ state: 'visible' });
    await page
      .locator(`.sim-section-heading > .${expected ? 'success' : 'failure'}`)
      .waitFor({ state: 'visible' });
    if (!expected)
      assert((await page.locator('.sim-current-message').innerText()).includes('Reguła ACL'));
    console.log(`PASS demo UI scenario: ${id}`);
  }
  await page.getByRole('button', { name: 'Zamknij symulację', exact: true }).click();
  await page.getByRole('button', { name: 'Diagnostyka', exact: true }).click();
  assert.equal(await dialog().locator('.diagnostic-item').count(), 0);
  await dialog().getByRole('button', { name: 'Zamknij', exact: true }).click();
  console.log(
    'PASS updated demo: example menu, printer, PoE budget, recording, isolation, diagnostics',
  );
  assert.deepEqual(errors, [], 'Browser errors');
  console.log(`UI ACCEPTANCE PASSED (${preview ? 'production preview' : 'npm run dev'})`);
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: '/tmp/netweave-ui-failure.png', fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
