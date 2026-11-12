import { useMemo } from 'react';
import type { Device, Network, Port } from '../model/networkTypes';
import { hardwareState, physicalLinkState } from '../model/ports';
import { linksAtPort } from '../model/portConnections';

export function PortPanel({
  device,
  network,
  selected,
  choose,
  unavailable,
}: {
  device: Device;
  network: Network;
  selected?: string;
  choose: (port: Port) => void;
  unavailable?: (port: Port) => string | undefined;
}) {
  const hw = useMemo(() => hardwareState(network), [network]);
  const groups = ['rj45', 'sfp', 'sfp+', 'wifi', 'virtual'] as const;
  return (
    <div className="port-panel" role="group" aria-label={`Panel portów: ${device.name}`}>
      <div className="port-panel-heading">
        <strong>{device.name}</strong>
        <span>{device.ports?.length || 0} portów</span>
      </div>
      {groups.map((connector) => {
        const ports = device.ports?.filter((p) => p.connector === connector) || [];
        if (!ports.length) return null;
        return (
          <section
            className="port-bank"
            key={connector}
            aria-label={`Gniazda ${connector.toUpperCase()}`}
          >
            <h4>
              {connector === 'wifi'
                ? 'Radio Wi-Fi'
                : connector === 'virtual'
                  ? 'Karty wirtualne'
                  : connector.toUpperCase()}
            </h4>
            <div className="port-grid">
              {ports.map((p) => {
                const links = linksAtPort(network, device.id, p.id);
                if (
                  device.kind === 'vm' &&
                  device.hostId &&
                  p.id === device.ports?.find((p) => p.connector === 'virtual')?.id
                )
                  links.push({ id: `virtual:${device.id}`, a: device.hostId, b: device.id });
                const up = links.some(
                  (l) =>
                    (hw.links.get(l.id) || physicalLinkState(network, l)).up &&
                    hw.powered.get(l.a) &&
                    hw.powered.get(l.b),
                );
                const state = !p.enabled ? 'disabled' : up ? 'up' : links.length ? 'down' : 'free';
                const label =
                  state === 'disabled'
                    ? 'wyłączony'
                    : state === 'up'
                      ? 'aktywny'
                      : state === 'down'
                        ? 'podłączony, brak aktywnego linku'
                        : 'wolny';
                const blocked = unavailable?.(p);
                const peers = links
                  .map(
                    (l) =>
                      network.devices.find((d) => d.id === (l.a === device.id ? l.b : l.a))?.name,
                  )
                  .filter(Boolean)
                  .join(', ');
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`port-slot ${state} ${selected === p.id ? 'selected' : ''}`}
                    data-port-id={p.id}
                    aria-label={`Port ${p.name} · ${connector.toUpperCase()} · ${label}${blocked ? ` · ${blocked}` : ''}`}
                    aria-pressed={selected === p.id}
                    disabled={!!blocked}
                    title={`${p.name} (${p.id}) · ${label}${peers ? ` · ${peers}` : ''}${blocked ? ` · ${blocked}` : ''}`}
                    onClick={() => choose(p)}
                  >
                    <span className={`port-jack ${connector}`} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>{p.name}</strong>
                    <small>
                      {state === 'down' ? '⚠ brak linku' : blocked ? 'niedostępny' : label}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!device.ports?.length && (
        <p className="port-panel-empty">Brak portów. Dodaj gniazdo w konfiguracji urządzenia.</p>
      )}
      <div className="port-legend">
        <span>
          <i className="up" />
          Aktywny
        </span>
        <span>
          <i className="free" />
          Wolny / brak linku
        </span>
        <span>
          <i className="disabled" />
          Wyłączony
        </span>
      </div>
    </div>
  );
}
