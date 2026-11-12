import { useState } from 'react';
import { Modal } from '../components/Modal';
import { PortPanel } from '../components/PortPanel';
import type { Cable, Device, Network, Port } from '../model/networkTypes';
import { cablesForPorts, portUnavailable, suggestedCable } from '../model/portConnections';
import { cableNames, physicalLinkState } from '../model/ports';

export function PortConnectionDialog({
  network,
  device,
  source,
  choose,
  close,
  configure,
  error,
}: {
  network: Network;
  device: Device;
  source?: { device: Device; port: Port };
  choose: (port: Port, options?: { cable: Cable; lengthMeters: number }) => void;
  close: () => void;
  configure: () => void;
  error?: string;
}) {
  const [selected, setSelected] = useState('');
  const [cable, setCable] = useState<Cable>();
  const [lengthMeters, setLength] = useState(3);
  const port = device.ports?.find((p) => p.id === selected);
  const media = source && port ? cablesForPorts(source.port, port) : [];
  const wire =
    source && port
      ? {
          id: 'connection-preview',
          a: source.device.id,
          aPortId: source.port.id,
          b: device.id,
          bPortId: port.id,
          cable: cable || suggestedCable(source.port, port),
          lengthMeters,
        }
      : undefined;
  const state = wire
    ? physicalLinkState({ ...network, links: [...network.links, wire] }, wire)
    : undefined;
  return (
    <Modal
      title={source ? 'Wybierz port docelowy' : 'Wybierz port początkowy'}
      description={
        source
          ? `${source.device.name} / ${source.port.name} → ${device.name}`
          : `${device.name} · kliknij gniazdo, a następnie wskaż drugie urządzenie na planszy`
      }
      close={close}
      wide
    >
      <div className="dialog-body">
        <PortPanel
          device={device}
          network={network}
          selected={selected}
          unavailable={(p) => portUnavailable(network, device, p, source)}
          choose={(p) => {
            if (!source) choose(p);
            else {
              setSelected(p.id);
              setCable(suggestedCable(source.port, p));
            }
          }}
        />
        <p className="field-hint">
          Zajęte i administracyjnie wyłączone porty są niedostępne. Radio AP może obsługiwać wielu
          klientów Wi-Fi. Gniazda niezgodne z wybranym końcem są zablokowane.
        </p>
        {source && port && (
          <div className="connection-preview">
            <h3>
              {source.device.name} / {source.port.name} ↔ {device.name} / {port.name}
            </h3>
            <div className="scope-grid">
              <label className="field">
                <span>Medium nowego połączenia</span>
                <select value={cable} onChange={(e) => setCable(e.target.value as Cable)}>
                  {media.map((c) => (
                    <option key={c} value={c}>
                      {cableNames[c]}
                    </option>
                  ))}
                </select>
              </label>
              {cable !== 'wireless' && (
                <label className="field">
                  <span>Długość nowego kabla (m)</span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={0.1}
                    value={Number.isFinite(lengthMeters) ? lengthMeters : ''}
                    onChange={(e) => setLength(e.target.valueAsNumber)}
                  />
                </label>
              )}
            </div>
            <div className={state?.up ? 'link-status up' : 'link-status down'}>
              <strong>
                {state?.up
                  ? `Profil łącza zgodny · ${state.speedMbps} Mb/s`
                  : 'Połączenie będzie wymagało konfiguracji'}
              </strong>
              {state?.errors.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
              {state?.warnings.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
            {!state?.up && (
              <p className="field-hint">
                Możesz zapisać kabel i uzupełnić moduły lub ustawienia w jego edytorze. Niezgodna
                konfiguracja nie przenosi ruchu.
              </p>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="form-error connection-error" role="alert">
          {error}
        </p>
      )}
      <footer className="dialog-footer">
        <button type="button" className="secondary" onClick={configure}>
          Konfiguruj porty urządzenia
        </button>
        <button type="button" className="secondary" onClick={close}>
          {source ? 'Wróć do wyboru urządzenia' : 'Anuluj'}
        </button>
        {source && (
          <button
            type="button"
            className="primary"
            disabled={
              !port ||
              !cable ||
              !Number.isFinite(lengthMeters) ||
              lengthMeters < 0 ||
              lengthMeters > 1000000
            }
            onClick={() => port && cable && choose(port, { cable, lengthMeters })}
          >
            Połącz wybrane porty
          </button>
        )}
      </footer>
    </Modal>
  );
}
