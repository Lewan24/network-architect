import { Modal } from '../components/Modal';
import { FloppyDisk, Play, Trash, ListChecks } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Network, Probe } from '../model/networkTypes';
import { simulateNetwork } from './networkEngine';
export function CustomScenarios({
  network,
  probe,
  update,
  select,
}: {
  network: Network;
  probe: Probe;
  update: (n: Network) => void;
  select: (p: Probe) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [expected, setExpected] = useState(true);
  const [results, setResults] = useState<{ id: string; ok: boolean; reason: string }[] | null>(
    null,
  );
  return (
    <section className="custom-scenarios">
      <header className="custom-scenarios-heading">
        <ListChecks />
        <h3>Własne scenariusze</h3>
        <span>{network.scenarios?.length ?? 0}</span>
      </header>
      <p className="custom-scenarios-intro">
        Ustaw źródło, cel i protokół w formularzu testu poniżej, a następnie zapisz oczekiwany
        dostęp. Scenariusze są zapisywane w projekcie.
      </p>
      <label className="field">
        <span>Nazwa scenariusza</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Np. Kamera ma dostęp do NVR"
        />
      </label>
      <label className="field">
        <span>Oczekiwany wynik</span>
        <select value={String(expected)} onChange={(e) => setExpected(e.target.value === 'true')}>
          <option value="true">Połączenie dozwolone</option>
          <option value="false">Połączenie zablokowane</option>
        </select>
      </label>
      <button
        className="primary custom-scenario-save"
        disabled={!name.trim() || !probe.source || !probe.destination}
        onClick={() => {
          update({
            ...network,
            scenarios: [
              ...(network.scenarios ?? []),
              {
                id: crypto.randomUUID(),
                name: name.trim(),
                probe: { ...probe, checkReply: true },
                expected,
              },
            ],
          });
          setName('');
          setResults(null);
        }}
      >
        <FloppyDisk /> Zapisz aktualny test
      </button>
      <button className="secondary custom-scenario-save" onClick={() => setOpen(true)}>
        <ListChecks /> Zapisane testy ({network.scenarios?.length ?? 0})
      </button>
      {open && (
        <Modal
          title="Zapisane scenariusze"
          description="Sprawdź oczekiwany dostęp po zmianach sieci. Wyniki dotyczą ostatniego uruchomienia."
          close={() => setOpen(false)}
          wide
        >
          <div className="dialog-body saved-scenarios">
            <div className="custom-scenarios-list-heading">
              <span>Zapisane testy</span>
              <button
                className="secondary"
                disabled={!network.scenarios?.length}
                onClick={() =>
                  setResults(
                    network.scenarios!.map((s) => {
                      const r = simulateNetwork(network, s.probe);
                      return { id: s.id, ok: r.ok === s.expected, reason: r.reason };
                    }),
                  )
                }
              >
                <Play /> Sprawdź wszystkie
              </button>
            </div>
            {!network.scenarios?.length && (
              <div className="custom-scenarios-empty">
                <ListChecks />
                <strong>Jeszcze nie ma scenariuszy</strong>
                <span>Zapisz pierwszy test, aby sprawdzać łączność po zmianach sieci.</span>
              </div>
            )}
            {results && (
              <p className="custom-scenarios-summary" role="status">
                Wyniki ostatniego uruchomienia: {results.filter((r) => r.ok).length}/
                {results.length} zgodnych. Po zmianach sieci uruchom ponownie.
              </p>
            )}
            {network.scenarios?.map((s) => (
              <article className="custom-scenario-card" key={s.id}>
                <strong>{s.name}</strong>
                <p className="custom-scenario-route">
                  {network.devices.find((d) => d.id === s.probe.source)?.name ?? s.probe.source} →{' '}
                  {network.devices.find((d) => d.id === s.probe.destination)?.name ??
                    s.probe.destination}{' '}
                </p>
                <div className="custom-scenario-tags">
                  <span>
                    {s.probe.protocol}
                    {s.probe.protocol !== 'ICMP' ? `/${s.probe.port}` : ''}
                  </span>
                  <span className={s.expected ? 'allow' : 'deny'}>
                    {s.expected ? 'Dozwolone' : 'Zablokowane'}
                  </span>
                </div>
                {results?.find((r) => r.id === s.id) && (
                  <p
                    className={`custom-scenario-result ${results.find((r) => r.id === s.id)!.ok ? 'pass' : 'fail'}`}
                  >
                    {results.find((r) => r.id === s.id)!.ok ? '✓ Zgodny' : '✗ Niezgodny'}:{' '}
                    {results.find((r) => r.id === s.id)!.reason}
                  </p>
                )}
                <div className="custom-scenario-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      const r = simulateNetwork(network, s.probe);
                      setResults((previous) => [
                        ...(previous ?? []).filter((x) => x.id !== s.id),
                        { id: s.id, ok: r.ok === s.expected, reason: r.reason },
                      ]);
                    }}
                  >
                    <Play /> Testuj
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      select({ ...s.probe });
                      setOpen(false);
                    }}
                  >
                    <Play /> Wczytaj test
                  </button>
                  <button
                    className="custom-scenario-delete"
                    aria-label={`Usuń scenariusz: ${s.name}`}
                    onClick={() => {
                      update({
                        ...network,
                        scenarios: network.scenarios!.filter((x) => x.id !== s.id),
                      });
                      setResults(null);
                    }}
                  >
                    <Trash /> Usuń
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
