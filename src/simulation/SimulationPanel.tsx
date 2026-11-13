import { CustomScenarios } from './CustomScenarios';
import {
  ArrowClockwise,
  ArrowsLeftRight,
  Check,
  FlowArrow,
  Pause,
  Play,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { exampleFor } from '../examples/catalog';
import { internetTargets } from '../model/internetModel';
import { supportsInterfaces } from '../model/interfaces';
import { tracePath, validHostname, validIp } from '../model/network';
import type { Network, Probe } from '../model/networkTypes';
import type { useSimulation } from './useSimulation';
type Props = {
  updateNetwork: (network: Network) => void;
  network: Network;
  probe: Probe;
  setProbe: (probe: Probe) => void;
  sim: ReturnType<typeof useSimulation>;
  close: () => void;
  editInterfaces: (id: string) => void;
};
export function TrafficPanel({
  updateNetwork,
  network,
  probe,
  setProbe,
  sim,
  close,
  editInterfaces,
}: Props) {
  const [mode, setMode] = useState<'device' | 'ip'>(
    network.devices.some((d) => d.id === probe.destination) ? 'device' : 'ip',
  );
  useEffect(() => {
    if (network.devices.some((d) => d.id === probe.destination)) setMode('device');
    else if (validIp(probe.destination) || validHostname(probe.destination)) setMode('ip');
  }, [probe.destination, network.devices]);
  const example = exampleFor(network);
  const scenarios = example?.scenarios || [];
  const [scenarioId, setScenarioId] = useState('');
  useEffect(() => {
    const initial = scenarios.find((s) =>
      ['source', 'destination', 'protocol', 'port'].every(
        (key) => s.probe[key as keyof Probe] === probe[key as keyof Probe],
      ),
    );
    setScenarioId(initial?.id || '');
  }, [network.exampleId]);
  const selectedScenario = scenarios.find((s) => s.id === scenarioId);
  const matchesScenario =
    selectedScenario &&
    ['source', 'destination', 'protocol', 'port'].every(
      (key) => selectedScenario.probe[key as keyof Probe] === probe[key as keyof Probe],
    );
  const active = sim.active;
  const pending = active?.status === 'pending';
  const devices = network.devices.filter((d) => !['switch-unmanaged', 'rack'].includes(d.kind));
  const external = network.devices.find((d) => d.id === probe.source)?.kind === 'internet';
  const sourceDevice = network.devices.find((d) => d.id === probe.source);
  const targetDevice = network.devices.find((d) => d.id === probe.destination);
  useEffect(() => {
    if (external) {
      setMode('ip');
      const ips = internetTargets(network);
      if (!ips.includes(probe.destination)) setProbe({ ...probe, destination: ips[0] || '' });
    }
  }, [external, probe.destination, network]);
  const trace = active ? tracePath(active.result) : [];
  const dnsInFlight = !!(
    pending &&
    active?.result.dns?.ok &&
    sim.hop < active.result.dns.queryPath.length - 1
  );
  const dnsReady = !pending || !!(active?.result.dns?.ok && !dnsInFlight);
  const steps = active
    ? pending
      ? active.result.steps.slice(0, sim.hop + 1)
      : active.status === 'cancelled'
        ? active.result.steps.slice(0, (active.reached || 0) + 1)
        : active.result.steps
    : [];
  const complete = sim.logs.filter((l) => l.status === 'complete');
  const success = complete.filter((l) => l.result.ok).length;
  function name(value: string) {
    return network.devices.find((d) => d.id === value)?.name || value;
  }
  return (
    <aside className="simulation-sidebar" aria-label="Panel symulacji ruchu">
      <header className="sim-panel-header">
        <h2>
          <FlowArrow /> Symulacja ruchu
        </h2>
        <button
          className="icon-button"
          title="Wróć do projektowania"
          aria-label="Zamknij symulację"
          onClick={close}
        >
          <X />
        </button>
      </header>
      <div className="sim-panel-scroll">
        <CustomScenarios network={network} probe={probe} update={updateNetwork} select={setProbe} />
        {scenarios.length > 0 && (
          <label className="demo-scenario-picker field">
            <span>Gotowy scenariusz laboratorium</span>
            <select
              aria-label="Scenariusz przykładowej sieci"
              value={scenarioId}
              onChange={(e) => {
                setScenarioId(e.target.value);
                const test = scenarios.find((p) => p.id === e.target.value);
                if (test) {
                  setProbe({ ...test.probe });
                  setMode(
                    network.devices.some((d) => d.id === test.probe.destination) ? 'device' : 'ip',
                  );
                }
              }}
            >
              <option value="">Wybierz test…</option>
              {scenarios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {matchesScenario && (
          <p
            className={`scenario-expectation ${selectedScenario.expected ? 'expected-pass' : 'expected-block'}`}
          >
            <strong>
              Oczekiwany wynik:{' '}
              {selectedScenario.expected ? 'połączenie działa' : 'brak połączenia / blokada'}
            </strong>
            <span>
              {selectedScenario.why ||
                (example?.intentionalProblems
                  ? 'Porównaj wynik z założeniami: sukces może ujawnić lukę w projekcie.'
                  : 'Wyślij pakiet i sprawdź również trasę odpowiedzi.')}
            </span>
          </p>
        )}
        <label className="sim-speed-control">
          <span>
            Tempo animacji <output>{sim.speed.toLocaleString('pl-PL')}×</output>
          </span>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={sim.speed}
            aria-label="Tempo animacji"
            aria-valuetext={`${sim.speed} razy`}
            onChange={(e) => sim.changeSpeed(Number(e.target.value))}
          />
          <small>
            <span>0,5×</span>
            <span>5×</span>
          </small>
        </label>
        <form
          className="sim-probe-form"
          onSubmit={(e) => {
            e.preventDefault();
            sim.start(probe);
          }}
        >
          <label className="field">
            <span>Źródło</span>
            <select
              aria-label="Źródło"
              value={probe.source}
              onChange={(e) =>
                setProbe({ ...probe, source: e.target.value, sourceInterfaceId: undefined })
              }
            >
              <option value="">Wybierz urządzenie</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {sourceDevice && supportsInterfaces(sourceDevice) && (
            <div className="interface-picker">
              <label className="field">
                <span>Interfejs źródła</span>
                <select
                  aria-label="Interfejs źródła"
                  value={probe.sourceInterfaceId || ''}
                  onChange={(e) =>
                    setProbe({ ...probe, sourceInterfaceId: e.target.value || undefined })
                  }
                >
                  <option value="">
                    {sourceDevice.interfaces?.length
                      ? 'Automatycznie według trasy'
                      : `Główny · ${sourceDevice.ip || 'oczekuje na DHCP'}`}
                  </option>
                  {sourceDevice.interfaces?.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} · {n.ip || 'DHCP'} /{n.prefix}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => editInterfaces(sourceDevice.id)}
              >
                Konfiguruj interfejsy źródła
              </button>
            </div>
          )}
          <div className="sim-target-label">
            <span>Cel komunikacji</span>
            <div>
              <button
                type="button"
                disabled={external}
                className={mode === 'device' ? 'active' : ''}
                onClick={() => {
                  setMode('device');
                  setProbe({
                    ...probe,
                    destination:
                      devices.find((d) => d.kind === 'server' || d.kind === 'vm')?.id || '',
                  });
                }}
              >
                Urządzenie
              </button>
              <button
                type="button"
                className={mode === 'ip' ? 'active' : ''}
                onClick={() => {
                  setMode('ip');
                  setProbe({
                    ...probe,
                    destination: network.devices.find((d) => d.wanIp)?.wanIp || '203.0.113.10',
                  });
                }}
              >
                IP / DNS
              </button>
            </div>
          </div>
          <div className="sim-target-control">
            {mode === 'device' ? (
              <select
                aria-label="Cel komunikacji"
                value={probe.destination}
                onChange={(e) =>
                  setProbe({
                    ...probe,
                    destination: e.target.value,
                    destinationInterfaceId: undefined,
                  })
                }
              >
                <option value="">Wybierz urządzenie</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : external ? (
              <select
                aria-label="Publiczny WAN celu"
                value={probe.destination}
                onChange={(e) =>
                  setProbe({
                    ...probe,
                    destination: e.target.value,
                    destinationInterfaceId: undefined,
                  })
                }
              >
                <option value="">Skonfiguruj publiczny WAN</option>
                {internetTargets(network).map((ip) => (
                  <option key={ip} value={ip}>
                    {ip}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="mono"
                aria-label="Docelowy adres IPv4 lub nazwa DNS"
                value={probe.destination}
                placeholder="IPv4 lub npm.lab.home.arpa"
                onChange={(e) =>
                  setProbe({
                    ...probe,
                    destination: e.target.value,
                    destinationInterfaceId: undefined,
                  })
                }
              />
            )}
            <button
              type="button"
              title="Zamień źródło z celem"
              aria-label="Zamień źródło i cel"
              disabled={mode === 'ip'}
              onClick={() =>
                setProbe({
                  ...probe,
                  source: probe.destination,
                  destination: probe.source,
                  sourceInterfaceId: probe.destinationInterfaceId,
                  destinationInterfaceId: probe.sourceInterfaceId,
                })
              }
            >
              <ArrowsLeftRight />
            </button>
          </div>
          {mode === 'device' && targetDevice && supportsInterfaces(targetDevice) && (
            <div className="interface-picker">
              <label className="field">
                <span>Interfejs celu</span>
                <select
                  aria-label="Interfejs celu"
                  value={probe.destinationInterfaceId || ''}
                  onChange={(e) =>
                    setProbe({ ...probe, destinationInterfaceId: e.target.value || undefined })
                  }
                >
                  <option value="">
                    {targetDevice.interfaces?.length
                      ? 'Interfejs główny'
                      : `Główny · ${targetDevice.ip || 'oczekuje na DHCP'}`}
                  </option>
                  {targetDevice.interfaces?.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} · {n.ip || 'DHCP'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => editInterfaces(targetDevice.id)}
              >
                Konfiguruj interfejsy celu
              </button>
            </div>
          )}
          <div className="sim-protocol-row">
            <label className="field">
              <span>Protokół</span>
              <select
                value={probe.protocol}
                onChange={(e) =>
                  setProbe({ ...probe, protocol: e.target.value as Probe['protocol'] })
                }
              >
                <option value="ICMP">ICMP · ping</option>
                <option>TCP</option>
                <option>UDP</option>
              </select>
            </label>
            <label className="field">
              <span>Port docelowy</span>
              <input
                type="number"
                min={1}
                max={65535}
                disabled={probe.protocol === 'ICMP'}
                placeholder="—"
                value={probe.protocol === 'ICMP' ? '' : probe.port}
                onChange={(e) => setProbe({ ...probe, port: +e.target.value })}
              />
            </label>
          </div>
          <label className="checkbox-label" style={{ marginBottom: 12, fontSize: 10 }}>
            <input
              type="checkbox"
              checked={probe.checkReply !== false}
              onChange={(e) => setProbe({ ...probe, checkReply: e.target.checked })}
            />{' '}
            Sprawdź odpowiedź i trasę powrotną
          </label>
          {external && (
            <p className="field-hint" style={{ marginBottom: 10 }}>
              Internet skanuje publiczny WAN. Prywatne urządzenia są osiągalne tylko przez
              publikację NAT i ACL.
            </p>
          )}
          <div className="sim-run-actions">
            <button
              type="submit"
              className="primary"
              disabled={
                !!sim.flight ||
                sim.random ||
                !probe.source ||
                !probe.destination ||
                probe.source === probe.destination ||
                (mode === 'ip' && !validIp(probe.destination) && !validHostname(probe.destination))
              }
            >
              <Play weight="fill" />
              Wyślij pakiet
            </button>
            <button
              type="button"
              className="secondary"
              title="Zatrzymaj symulację"
              aria-label="Zatrzymaj symulację"
              disabled={!sim.flight && !sim.random}
              onClick={sim.stop}
            >
              <Pause />
            </button>
          </div>
          <label className="checkbox-label random-traffic">
            <input
              type="checkbox"
              checked={sim.random}
              onChange={(e) => sim.setRandom(e.target.checked)}
            />
            Losowy ruch z internetu
            <span className={sim.random ? 'live-light' : ''} />
          </label>
        </form>
        <section className="sim-live-status" aria-live="polite">
          <div className="sim-section-heading">
            <h3>Aktualny pakiet</h3>
            <span
              className={
                pending
                  ? 'pending'
                  : active?.status === 'complete'
                    ? active.result.ok
                      ? 'success'
                      : 'failure'
                    : 'cancelled'
              }
            >
              {pending
                ? 'W drodze'
                : active?.status === 'complete'
                  ? active.result.ok
                    ? 'Odpowiedź / sukces'
                    : active.result.verdict === 'closed'
                      ? 'Port zamknięty'
                      : 'Zablokowano'
                  : active?.status === 'cancelled'
                    ? 'Przerwano'
                    : sim.random
                      ? 'Oczekiwanie'
                      : 'Gotowy'}
            </span>
          </div>
          {active ? (
            <>
              <div className="sim-current-endpoints">
                <strong>{active.names[active.probe.source] || active.probe.source}</strong>
                <span>→</span>
                <strong>
                  {active.names[active.probe.destination] || active.probe.destination}
                </strong>
              </div>
              <div className="sim-packet-meta">
                <span>
                  {dnsInFlight ? (
                    'DNS / UDP :53'
                  ) : (
                    <>
                      {active.probe.protocol}
                      {active.probe.protocol === 'ICMP' ? '' : ` :${active.probe.port}`}
                    </>
                  )}
                </span>
                <span>{active.time}</span>
              </div>
              <p className="sim-current-message">
                {pending
                  ? `${active.names[trace[sim.hop]] || 'Źródło'} → ${active.names[trace[sim.hop + 1]] || 'przetwarzanie pakietu'}`
                  : active.status === 'cancelled'
                    ? 'Test zatrzymany przez użytkownika lub zmianę topologii.'
                    : active.result.reason}
              </p>
              {active.result.dns && dnsReady && (
                <div className="dns-resolution-summary">
                  <strong>DNS {active.result.dns.ok ? 'A' : 'błąd'}</strong>
                  <span>
                    {active.result.dns.name}
                    {active.result.dns.address ? ' → ' + active.result.dns.address : ''}
                  </span>
                  <small>
                    Resolver:{' '}
                    {active.names[active.result.dns.serverId || ''] ||
                      active.result.dns.serverId ||
                      'nieskonfigurowany'}
                  </small>
                </div>
              )}
              <ol className="sim-hop-list">
                {steps.map((s, i) => (
                  <li key={i}>
                    <span>{i + 1}</span>
                    <p>{s}</p>
                  </li>
                ))}
              </ol>
              {active.status === 'complete' && active.result.packet && (
                <div className="sim-translated-packet">
                  <span>Pakiet na końcu ścieżki</span>
                  <code>
                    {active.result.packet.sourceIp} → {active.result.packet.destinationIp}
                    {active.probe.protocol === 'ICMP' ? '' : ':' + active.result.packet.port}
                  </code>
                </div>
              )}
              <button
                className="sim-replay"
                disabled={!!sim.flight || sim.random}
                onClick={() => sim.start(active.probe)}
              >
                <ArrowClockwise /> Powtórz test
              </button>
            </>
          ) : (
            <div className="sim-empty">
              <FlowArrow />
              <p>Wyślij pakiet, aby śledzić jego przebieg przez urządzenia.</p>
            </div>
          )}
        </section>
        <div className="sim-stats">
          <span>
            <i className="success-dot" />
            {success} dostarczonych
          </span>
          <span>
            <i className="failure-dot" />
            {complete.length - success} nieudanych
          </span>
        </div>
        <details className="sim-history">
          <summary>
            Historia testów <b>{sim.logs.length}</b>
          </summary>
          <div className="sim-history-actions">
            <button disabled={!!sim.flight || !sim.logs.length} onClick={sim.clear}>
              Wyczyść historię
            </button>
          </div>
          {sim.logs.slice(0, 15).map((l) => (
            <button
              key={l.id}
              className={`sim-history-row ${l.id === active?.id ? 'active' : ''}`}
              disabled={!!sim.flight}
              onClick={() => sim.inspect(l.id)}
            >
              <span
                className={`sim-history-icon ${l.status === 'complete' ? (l.result.ok ? 'success' : 'failure') : 'pending'}`}
              >
                {l.status === 'complete' ? l.result.ok ? <Check /> : <X /> : <Pause />}
              </span>
              <span>
                <strong>
                  {l.names[l.probe.source] || name(l.probe.source)} →{' '}
                  {l.names[l.probe.destination] || l.probe.destination}
                </strong>
                <small>
                  {l.time} · {l.probe.protocol}
                  {l.probe.protocol === 'ICMP' ? '' : ' / ' + l.probe.port} ·{' '}
                  {l.status === 'cancelled'
                    ? 'przerwano'
                    : l.status === 'pending'
                      ? 'w drodze'
                      : l.result.ok
                        ? 'dostarczono'
                        : 'zablokowano'}
                </small>
              </span>
            </button>
          ))}
        </details>
      </div>
      <footer className="sim-panel-footer">Symulacja modelowa · 1 s na przeskok</footer>
    </aside>
  );
}
