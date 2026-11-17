import fs from 'node:fs/promises';
import ts from 'typescript';
import { format } from 'prettier';

// The in-app guide is the source of truth; repository docs contain only a compact index.
const source = await fs.readFile(
  new URL('../src/learning/guideContent.ts', import.meta.url),
  'utf8',
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { lessons, planningSteps, sources } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
const cell = (text) => text.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
let output = '# Indeks poradnika\n\n';
output +=
  'Pełne lekcje są w aplikacji pod przyciskiem **Poradnik**. Ten skrót powstaje z `src/learning/guideContent.ts`; odtwórz go poleceniem `npm run docs:guide`.\n\n';
output +=
  '## Jak korzystać\n\nW **Przykładach** wybierz fikcyjną topologię biurową, małe środowisko, home lab, sieć ze strefami lub antywzorzec. W **Poradniku → Laboratoria** porównaj wariant z błędem z poprawionym i uruchom przygotowany test. Wczytanie projektu zastępuje bieżącą sieć i można je cofnąć. Sukces testu oznacza łączność, nie ocenę bezpieczeństwa.\n\n';
output +=
  '## Plan projektowania\n\n' +
  planningSteps.map(([title], i) => `${i + 1}. ${title}`).join('\n') +
  '\n\n';
output += '## Lekcje\n\n| Temat | Najważniejsza zasada |\n| --- | --- |\n';
for (const lesson of lessons)
  output += `| ${cell(lesson.title.replace(/^\d+\.\s*/, ''))} | ${cell(lesson.takeaway)} |\n`;
output +=
  '\n## Źródła techniczne\n\n' +
  Object.values(sources)
    .map((s) => `- [${s.title}](${s.url})`)
    .join('\n') +
  '\n\n';
output +=
  '## Konfiguracja i ograniczenia\n\n[Konfiguracja sieci](CONFIGURATION.md) opisuje działanie modelu i jego granice. [Wi-Fi i dostęp](WIFI.md) obejmuje PPSK, RADIUS i MAB. Przykłady nie uruchamiają usług ani nie odtwarzają firmware fizycznych urządzeń.\n';
await fs.writeFile(
  new URL('../docs/NETWORK_GUIDE.md', import.meta.url),
  await format(output, { parser: 'markdown', printWidth: 100 }),
);
console.log('Generated compact docs/NETWORK_GUIDE.md from the in-app guide.');
