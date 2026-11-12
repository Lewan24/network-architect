import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { SettingsSection } from '../components/SettingsSection';
import { networkExamples } from '../examples/catalog';
import { miniLab } from '../examples/miniLabs';
import { lessons, planningSteps, sources, glossary } from './guideContent';
import type { Network } from '../model/networkTypes';
import type { ExampleSection } from '../examples/exampleTypes';
function MiniPreview({ network }: { network: Network }) {
  const internet = network.devices.find((d) => d.kind === 'internet');
  const levels = new Map<string, number>();
  if (internet) levels.set(internet.id, 0);
  for (let pass = 0; pass < network.devices.length; pass++)
    for (const l of network.links) {
      if (levels.has(l.a) && !levels.has(l.b)) levels.set(l.b, levels.get(l.a)! + 1);
      if (levels.has(l.b) && !levels.has(l.a)) levels.set(l.a, levels.get(l.b)! + 1);
    }
  const widestLevel = Math.max(
    1,
    ...network.devices.map(
      (d) =>
        network.devices.filter((x) => (levels.get(x.id) || 0) === (levels.get(d.id) || 0)).length,
    ),
  );
  const previewWidth = Math.max(720, (widestLevel + 1) * 176);
  const previewHeight = Math.max(340, Math.max(0, ...levels.values()) * 88 + 90);
  const positions = new Map(
    network.devices.map((d) => {
      const depth = levels.get(d.id) || 0;
      const peers = network.devices.filter((x) => (levels.get(x.id) || 0) === depth);
      return [
        d.id,
        { x: (previewWidth * (peers.indexOf(d) + 1)) / (peers.length + 1), y: 35 + depth * 88 },
      ];
    }),
  );
  return (
    <svg
      className="lesson-preview"
      viewBox={`0 0 ${previewWidth} ${previewHeight}`}
      role="img"
      aria-label="Miniatura topologii laboratorium"
    >
      {network.links.map((l) => {
        const a = positions.get(l.a)!,
          b = positions.get(l.b)!;
        return (
          <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9caec2" strokeWidth={2} />
        );
      })}
      {network.devices.map((d) => {
        const p = positions.get(d.id)!;
        return (
          <g key={d.id} transform={`translate(${p.x},${p.y})`}>
            <title>{d.name}</title>
            <rect
              x={-78}
              y={-25}
              width={156}
              height={53}
              rx={7}
              fill="white"
              stroke={network.vlans.find((v) => v.id === d.vlan)?.color || '#7185a0'}
              strokeWidth={2}
            />
            <text textAnchor="middle" y={-3}>
              {d.name.slice(0, 24)}
            </text>
            <text textAnchor="middle" y={15} className="preview-detail">
              {d.kind === 'internet'
                ? 'WAN'
                : d.kind === 'rack'
                  ? `${d.rack?.heightU}U · montaż`
                  : `VLAN ${d.vlan} · ${d.ip || 'DHCP'}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
export function LearningCenter({
  close,
  load,
  locate,
  currentId,
}: {
  close: () => void;
  load: (id: string, scenarioId?: string) => void;
  locate: (id: string, section: ExampleSection) => void;
  currentId?: string;
}) {
  const [page, setPage] = useState('start');
  const [lessonId, setLessonId] = useState(lessons[0].id);
  const lesson = lessons.find((l) => l.id === lessonId)!;
  const [fixed, setFixed] = useState(false);
  const lab = useMemo(() => miniLab(lessonId, fixed), [lessonId, fixed]);
  const network = useMemo(() => lab.create(), [lab]);
  return (
    <Modal
      title="Poradnik projektowania sieci"
      description="Od pierwszego VLAN-u do polityki stref — z działającymi laboratoriami"
      close={close}
      wide
    >
      <nav className="learning-tabs" aria-label="Działy poradnika">
        {[
          ['start', 'Plan projektowania'],
          ['projects', 'Przykładowe projekty'],
          ['labs', 'Laboratoria: problem i rozwiązanie'],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={page === id ? 'active' : ''}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="dialog-body learning-body">
        {page === 'start' && (
          <>
            <div className="learning-intro">
              <span className="eyebrow">ZACZNIJ OD WYMAGAŃ</span>
              <h3>Projektuj przepływy i granice zaufania</h3>
              <p>
                Najpierw ustal, kto ma korzystać z jakiej usługi. Potem dobierz VLAN-y, adresy,
                porty i reguły. Zielony pakiet oznacza osiągalność — nie automatycznie bezpieczny
                projekt.
              </p>
            </div>
            <details className="learning-glossary">
              <summary>Słowniczek: VLAN, brama, trunk, ACL, DHCP, DNS i inne pojęcia</summary>
              <dl>
                {glossary.map(([term, meaning]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{meaning}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {planningSteps.map(([title, text], i) => (
              <SettingsSection
                key={title}
                title={`${i + 1}. ${title}`}
                tone={i % 2 ? 'green' : 'blue'}
              >
                <p>{text}</p>
              </SettingsSection>
            ))}
            <SettingsSection title="Przykładowa macierz uprawnień" tone="purple">
              <div className="table-scroll">
                <table className="learning-table">
                  <thead>
                    <tr>
                      <th>Źródło</th>
                      <th>Cel</th>
                      <th>Usługa</th>
                      <th>Decyzja</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Pracownik</td>
                      <td>Drukarka</td>
                      <td>TCP/631 IPP</td>
                      <td>Zezwól</td>
                    </tr>
                    <tr>
                      <td>Gość</td>
                      <td>Pliki firmowe</td>
                      <td>TCP/445</td>
                      <td>Blokuj</td>
                    </tr>
                    <tr>
                      <td>NVR</td>
                      <td>Kamera</td>
                      <td>TCP/554 RTSP</td>
                      <td>Zezwól</td>
                    </tr>
                    <tr>
                      <td>Kamera</td>
                      <td>Pliki</td>
                      <td>Nowe połączenie</td>
                      <td>Blokuj</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                Takie przypadki możesz uruchomić w małej firmie. W każdym projekcie sprawdź
                rzeczywiste wymagania aplikacji i producenta, także porty pomocnicze.
              </p>
            </SettingsSection>
            <button className="primary" onClick={() => setPage('labs')}>
              Przejdź do małych laboratoriów
            </button>
            <div className="learning-sources">
              <h3>Podstawa porad</h3>
              {Object.values(sources).map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                  {s.title} ↗
                </a>
              ))}
            </div>
          </>
        )}
        {page === 'projects' && (
          <>
            <p className="info-line">
              Wczytanie zastępuje bieżący projekt; zmianę można cofnąć. Sekcja konfiguracji pozwala
              obejrzeć konkretny fragment rozwiązania.
            </p>
            <div className="learning-projects">
              {networkExamples
                .filter((e) => e.category !== 'Ćwiczenie')
                .map((e) => (
                  <article
                    key={e.id}
                    className={`learning-project ${e.intentionalProblems ? 'intentional' : ''}`}
                  >
                    <span className="eyebrow">
                      {e.category} · {e.level}
                    </span>
                    <h3>{e.name}</h3>
                    <p>{e.description}</p>
                    <ul>
                      {e.objectives.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                    <button className="primary" onClick={() => load(e.id, e.scenarios[0]?.id)}>
                      Wczytaj: {e.name}
                    </button>
                    <details>
                      <summary>Gdzie sprawdzić rozwiązania?</summary>
                      {e.sections.map((s) => (
                        <button
                          type="button"
                          className="section-link"
                          key={s.label}
                          onClick={() => locate(e.id, s)}
                        >
                          {currentId === e.id ? 'Otwórz' : 'Wczytaj i otwórz'}: {s.label}
                        </button>
                      ))}
                    </details>
                  </article>
                ))}
            </div>
          </>
        )}
        {page === 'labs' && (
          <div className="lesson-layout">
            <nav aria-label="Lekcje">
              {lessons.map((l) => (
                <button
                  key={l.id}
                  className={lesson.id === l.id ? 'active' : ''}
                  onClick={() => {
                    setLessonId(l.id);
                    setFixed(false);
                  }}
                >
                  {l.title}
                </button>
              ))}
            </nav>
            <article className="lesson-content">
              <h3>{lesson.title}</h3>
              <p className="lesson-lead">{lesson.lead}</p>
              <div className="lesson-comparison">
                <section className="problem">
                  <strong>Problem</strong>
                  <p>{lesson.problem}</p>
                </section>
                <section className="solution">
                  <strong>Rozwiązanie</strong>
                  <p>{lesson.solution}</p>
                </section>
              </div>
              <div className="lesson-variants" role="group" aria-label="Wariant laboratorium">
                <button
                  aria-pressed={!fixed}
                  className={!fixed ? 'active' : ''}
                  onClick={() => setFixed(false)}
                >
                  Wariant z błędem
                </button>
                <button
                  aria-pressed={fixed}
                  className={fixed ? 'active' : ''}
                  onClick={() => setFixed(true)}
                >
                  Poprawiony wariant
                </button>
              </div>
              <MiniPreview network={network} />
              <p className="expected-result">
                <strong>
                  Oczekiwany test:{' '}
                  {lab.scenarios[0].expected ? 'połączenie działa' : 'brak połączenia / blokada'}.
                </strong>{' '}
                {lab.scenarios[0].why}
              </p>
              <button className="primary" onClick={() => load(lab.id, 'lesson-test')}>
                Wczytaj laboratorium z testem
              </button>
              <p className="field-hint">
                Otworzy planszę i przygotuje test w panelu. Kliknij „Wyślij pakiet”. Wczytanie można
                cofnąć.
              </p>
              <SettingsSection title="Zrób to krok po kroku" tone="blue">
                <ol>
                  {lesson.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </SettingsSection>
              <SettingsSection title="Co zapamiętać" tone="green">
                <p>{lesson.takeaway}</p>
              </SettingsSection>
              <details>
                <summary>Przejdź do konkretnej konfiguracji</summary>
                {lab.sections.map((s) => (
                  <button className="section-link" key={s.label} onClick={() => locate(lab.id, s)}>
                    Wczytaj i otwórz: {s.label}
                  </button>
                ))}
              </details>
              <div className="learning-sources">
                {lesson.sourceKeys.map((key) => (
                  <a key={key} href={sources[key].url} target="_blank" rel="noreferrer">
                    {sources[key].title} ↗
                  </a>
                ))}
              </div>
            </article>
          </div>
        )}
      </div>
      <footer className="dialog-footer">
        <span>
          Model logiczny: reguły i zależności. Wdrożenie wymaga weryfikacji sprzętu i konfiguracji
          systemów.
        </span>
        <button className="secondary" onClick={close}>
          Zamknij poradnik
        </button>
      </footer>
    </Modal>
  );
}
