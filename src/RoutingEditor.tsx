import { Info, Plus, Trash } from '@phosphor-icons/react';
import { topologyLinks } from './network';
import type { Device, Network, StaticRoute } from './networkTypes';

export function RoutingEditor({
  device: d,
  network,
  patch,
}: {
  device: Device;
  network: Network;
  patch: (p: Partial<Device>) => void;
}) {
  const neighbors = topologyLinks(network)
    .flatMap((l) => (l.a === d.id ? [l.b] : l.b === d.id ? [l.a] : []))
    .map((id) => network.devices.find((x) => x.id === id)!)
    .filter(Boolean);
  const routes = d.routes || [];
  function update(id: string, p: Partial<StaticRoute>) {
    patch({ routes: routes.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }
  return (
    <section>
      <label className="acl-default">
        <span>
          <strong>Tryb wyznaczania trasy</strong>
          <small>Automatyczny model topologii lub jawna tablica routingu.</small>
        </span>
        <select
          value={d.routingMode || 'automatic'}
          onChange={(e) => patch({ routingMode: e.target.value as Device['routingMode'] })}
        >
          <option value="automatic">Automatycznie z połączeń</option>
          <option value="static">Tablica tras statycznych</option>
        </select>
      </label>
      <div className="section-heading">
        <div>
          <h3>Trasy statyczne</h3>
          <p>Najdłuższy prefiks wygrywa; przy równym prefiksie decyduje mniejsza metryka.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!neighbors.length}
          onClick={() =>
            patch({
              routes: [
                ...routes,
                {
                  id: crypto.randomUUID(),
                  destination: '0.0.0.0/0',
                  nextHopId: neighbors[0]?.id || '',
                  metric: 10,
                },
              ],
            })
          }
        >
          <Plus /> Dodaj trasę
        </button>
      </div>
      {!neighbors.length && (
        <p className="info-line">
          <Info />
          Najpierw połącz router z innym urządzeniem na planszy.
        </p>
      )}
      <div className="route-list">
        {routes.map((r, i) => (
          <div className="route-row" key={r.id}>
            <label className="field">
              <span>Podsieć docelowa CIDR</span>
              <input
                value={r.destination}
                onChange={(e) => update(r.id, { destination: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Następny skok</span>
              <select
                value={r.nextHopId}
                onChange={(e) => update(r.id, { nextHopId: e.target.value })}
              >
                <option value="">Wybierz połączenie</option>
                {neighbors.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} · {n.ip}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Metryka</span>
              <input
                type="number"
                min={0}
                max={65535}
                value={r.metric}
                onChange={(e) => update(r.id, { metric: +e.target.value })}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Usuń trasę ${i + 1}`}
              onClick={() => patch({ routes: routes.filter((x) => x.id !== r.id) })}
            >
              <Trash />
            </button>
          </div>
        ))}
      </div>
      {!routes.length && (
        <p className="empty-inline">
          Brak tras użytkownika. Sieci z interfejsem L3 na tym urządzeniu mają trasy connected.
          Pozostały ruch wymaga trasy, np. 0.0.0.0/0 do internetu.
        </p>
      )}
      <p className="info-line">
        <Info />
        0.0.0.0/0 = trasa domyślna. Następny skok musi być bezpośrednim sąsiadem. Przy zaznaczonym
        sprawdzaniu odpowiedzi tablica jest weryfikowana także w drodze powrotnej.
      </p>
    </section>
  );
}
