import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { diagnoseNetwork } from '../model/diagnostics';
import { hardwareState } from '../model/ports';
import type { Network, Result } from '../model/networkTypes';
export function DiagnosticsDialog({
  network,
  lastResult,
  close,
  inspect,
}: {
  network: Network;
  lastResult?: Result;
  close: () => void;
  inspect: (id: string) => void;
}) {
  const issues = useMemo(() => diagnoseNetwork(network), [network]);
  const hw = useMemo(() => hardwareState(network), [network]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const shown = issues.filter(
    (d) =>
      (filter === 'all' || d.severity === filter) &&
      `${d.title} ${d.message}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')),
  );
  return (
    <Modal
      title="Diagnostyka projektu"
      description="Kontrola konfiguracji portów, kabli, PoE, VLAN-ów i adresacji"
      close={close}
      wide
    >
      <div className="dialog-body">
        <div className="diagnostic-summary">
          {(['error', 'warning', 'info'] as const).map((severity) => (
            <button
              key={severity}
              type="button"
              onClick={() => setFilter(filter === severity ? 'all' : severity)}
              className={`diagnostic-count ${severity} ${filter === severity ? 'active' : ''}`}
            >
              <strong>{issues.filter((d) => d.severity === severity).length}</strong>
              {severity === 'error'
                ? 'Błędy'
                : severity === 'warning'
                  ? 'Ostrzeżenia'
                  : 'Informacje'}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Szukaj urządzenia lub problemu</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="np. VLAN, duplex, DHCP, PoE"
          />
        </label>
        {lastResult && (
          <section className="diagnostic-trace">
            <h3>Ostatni zakończony test</h3>
            <p className={lastResult.ok ? 'info-line' : 'form-error'}>{lastResult.reason}</p>
            <p>
              Ostatnie osiągnięte urządzenie:{' '}
              {network.devices.find((d) => d.id === lastResult.path.at(-1))?.name || 'brak'}
            </p>
            {lastResult.bottleneckMbps && (
              <p>
                Najwolniejsze łącze na ścieżce: {lastResult.bottleneckMbps} Mb/s (bez modelu
                obciążenia).
              </p>
            )}
            <details>
              <summary>Decyzje na ścieżce, reguły ACL i NAT</summary>
              <ol>
                {lastResult.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </details>
          </section>
        )}
        <div className="diagnostic-list">
          {shown.map((d) => (
            <article key={d.id} className={`diagnostic-item ${d.severity}`}>
              <h3>{d.title}</h3>
              <p>{d.message}</p>
              <p>
                <strong>Zalecane działanie:</strong> {d.remedy}
              </p>
              {(d.linkId || d.deviceId || d.vlanId) && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    close();
                    inspect(d.linkId || d.deviceId || `zone:${d.vlanId}`);
                  }}
                >
                  Otwórz konfigurację
                </button>
              )}
            </article>
          ))}
        </div>
        {!shown.length && (
          <p className="empty-inline">
            {issues.length
              ? 'Brak wyników dla wybranego filtra.'
              : 'Nie wykryto problemów w kontrolowanym zakresie.'}
          </p>
        )}
        {[...hw.poe].some(([, p]) => p.budget > 0) && (
          <section>
            <h3>Budżety PoE po stronie PSE</h3>
            <div className="diagnostic-poe">
              {[...hw.poe]
                .filter(([, p]) => p.budget > 0)
                .map(([id, p]) => (
                  <p key={id}>
                    <strong>{network.devices.find((d) => d.id === id)?.name}</strong> ·{' '}
                    {p.allocated.toFixed(1)} / {p.budget} W · {p.consumers.length} odbiorników
                  </p>
                ))}
            </div>
          </section>
        )}
        <p className="field-hint">
          To audyt logiczny i zgodność ze skonfigurowanymi profilami sprzętu, a nie pomiar BER,
          opóźnienia czy obciążenia. Brak ostrzeżeń nie potwierdza działania usług na fizycznym
          sprzęcie. Zasięg i moc modułów porównaj z dokumentacją konkretnego urządzenia.
        </p>
      </div>
      <footer className="dialog-footer">
        <button type="button" className="secondary" onClick={close}>
          Zamknij
        </button>
      </footer>
    </Modal>
  );
}
