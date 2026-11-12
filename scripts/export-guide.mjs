import fs from 'node:fs/promises';
import ts from 'typescript';
import { format } from 'prettier';
// Render the app's own source of truth; no runtime application or browser is needed.
const source = await fs.readFile(
  new URL('../src/learning/guideContent.ts', import.meta.url),
  'utf8',
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { lessons, planningSteps, sources, glossary } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
let output =
  '# Poradnik projektowania sieci\n\nPoradnik jest dostępny w aplikacji pod przyciskiem **Poradnik**. Tekst tego pliku pochodzi z `src/learning/guideContent.ts`; po zmianie treści uruchom `npm run docs:guide`.\n\n## Jak pracować z przykładami\n\nW menu **Przykład** znajdziesz małą firmę, home lab, dużą firmę z DMZ i dwiema zaporami, dotychczasowe laboratorium biurowe oraz celowo błędny antywzorzec. Każdy projekt ma własne testy w panelu Symulacja. W Poradniku, w zakładce projektów, przyciski prowadzą do konkretnych sekcji konfiguracji.\n\nZakładka **Laboratoria: problem i rozwiązanie** zawiera sześć par małych projektów. Porównaj wariant z błędem z poprawionym. Wczytanie zastępuje bieżący projekt, można je cofnąć. Przycisk wczytania przygotowuje parametry testu; następnie kliknij **Wyślij pakiet**. Zielony wynik oznacza łączność, nie ocenę bezpieczeństwa.\n\n';
output +=
  '## Słowniczek\n\n' +
  glossary.map(([term, meaning]) => `- **${term}:** ${meaning}`).join('\n') +
  '\n\n';
output += '## Plan projektowania\n\n';
for (const [i, [title, text]] of planningSteps.entries())
  output += `### ${i + 1}. ${title}\n\n${text}\n\n`;
for (const lesson of lessons) {
  output += `## ${lesson.title}\n\n${lesson.lead}\n\n**Problem:** ${lesson.problem}\n\n**Rozwiązanie:** ${lesson.solution}\n\n`;
  output += lesson.steps.map((step, i) => `${i + 1}. ${step}`).join('\n') + '\n\n';
  output += `**Co zapamiętać:** ${lesson.takeaway}\n\nŹródła: ${lesson.sourceKeys.map((key) => `[${sources[key].title}](${sources[key].url})`).join(', ')}.\n\n`;
}
output +=
  '## Zakres symulacji\n\nPrzykłady sprawdzają logiczne VLAN-y, adresację, DHCP, DNS, ACL, statyczne trasy, NAT, porty, usługi i PoE. Nie emulują kont użytkowników, VPN, STP/LACP/HA, stosu TCP, SIEM, aktualizacji firmware ani UPS. Zastosowanie tych rozwiązań na rzeczywistym sprzęcie wymaga jego dokumentacji, konfiguracji i pomiarów.\n';
await fs.writeFile(
  new URL('../docs/NETWORK_GUIDE.md', import.meta.url),
  await format(output, { parser: 'markdown', printWidth: 100 }),
);
console.log('Generated docs/NETWORK_GUIDE.md from the in-app guide.');
