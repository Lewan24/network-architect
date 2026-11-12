import { Check } from '@phosphor-icons/react';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import type { Cable, Device, Link, Network } from '../model/networkTypes';
import {
  cableNames,
  inferCable,
  physicalLinkState,
  portFor,
  prepareHardware,
} from '../model/ports';
import { validateHardware } from '../model/hardwareValidation';
import { PortFields } from './PortFields';
import { PortPanel } from '../components/PortPanel';
import { linksAtPort } from '../model/portConnections';
export function LinkDialog({
  link,
  network,
  close,
  save,
}: {
  link: Link;
  network: Network;
  close: () => void;
  save: (link: Link, devices?: Device[]) => void;
}) {
  const [prepared] = useState(() => prepareHardware(network));
  const [draft, setDraft] = useState(
    () => prepared.links.find((l) => l.id === link.id) || structuredClone(link),
  );
  const [devices, setDevices] = useState(prepared.devices);
  const [error, setError] = useState('');
  const preview = {
    ...network,
    devices,
    links: network.links.map((l) => (l.id === draft.id ? draft : l)),
  };
  const state = physicalLinkState(preview, draft);
  return (
    <Modal
      title="Porty i połączenie"
      description={`${network.devices.find((d) => d.id === link.a)?.name} ↔ ${network.devices.find((d) => d.id === link.b)?.name}`}
      close={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validateHardware(preview);
            save(draft, devices);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="dialog-body">
          <div className="scope-grid">
            <label className="field">
              <span>Etykieta kabla</span>
              <input
                value={draft.label || ''}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="np. SW1/24 ↔ serwer/eth0"
              />
            </label>
            <label className="field">
              <span>Medium</span>
              <select
                value={draft.cable || inferCable(state.aPort, state.bPort)}
                onChange={(e) => setDraft({ ...draft, cable: e.target.value as Cable })}
              >
                {Object.entries(cableNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!['wireless', 'virtual'].includes(draft.cable || '') && (
            <label className="field">
              <span>Długość całego toru (m), razem z patchcordami</span>
              <input
                type="number"
                min={0}
                max={1000000}
                step={0.1}
                value={draft.lengthMeters ?? 3}
                onChange={(e) => setDraft({ ...draft, lengthMeters: +e.target.value })}
              />
            </label>
          )}
          <div className={state.up ? 'link-status up' : 'link-status down'}>
            <strong>
              {state.up ? `Łącze aktywne · ${state.speedMbps} Mb/s` : 'Łącze nieaktywne'}
            </strong>
            {state.errors.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
            {state.warnings.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
          <div className="link-endpoints">
            {(['a', 'b'] as const).map((side) => {
              const d = devices.find((d) => d.id === draft[side])!;
              const p = portFor(preview, draft, side);
              return (
                <section className="link-endpoint" key={side}>
                  <h3>
                    {side.toUpperCase()} · {d.name}
                  </h3>
                  <PortPanel
                    device={d}
                    network={preview}
                    selected={draft[`${side}PortId`]}
                    unavailable={(candidate) =>
                      candidate.id !== draft[`${side}PortId`] &&
                      !(candidate.connector === 'wifi' && d.kind === 'accesspoint') &&
                      linksAtPort(network, d.id, candidate.id).some((l) => l.id !== draft.id)
                        ? 'Port jest już zajęty'
                        : undefined
                    }
                    choose={(candidate) => setDraft({ ...draft, [`${side}PortId`]: candidate.id })}
                  />
                  {!p && (
                    <p className="field-hint">
                      Wybierz gniazdo powyżej lub dodaj je w konfiguracji urządzenia.
                    </p>
                  )}
                  {p && (
                    <PortFields
                      port={p}
                      network={network}
                      patch={(value) => {
                        setDevices((ds) =>
                          ds.map((x) =>
                            x.id === d.id
                              ? {
                                  ...x,
                                  ports: x.ports?.map((port) =>
                                    port.id === p.id ? { ...port, ...value } : port,
                                  ),
                                }
                              : x,
                          ),
                        );
                        setError('');
                      }}
                    />
                  )}
                </section>
              );
            })}
          </div>
          <details className="legacy-link-settings">
            <summary>Domyślne ustawienia połączenia</summary>
            <p className="field-hint">
              Obowiązują tylko dla portów w trybie zgodności. Tryby access i trunk wybrane powyżej
              mają własne ustawienia po obu stronach.
            </p>
            <label className="field">
              <span>Domyślny tryb VLAN</span>
              <select
                value={draft.mode || 'auto'}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as Link['mode'] })}
              >
                <option value="auto">Automatyczny</option>
                <option value="access">Access</option>
                <option value="trunk">Trunk</option>
              </select>
            </label>
            {draft.mode === 'access' && (
              <label className="field">
                <span>VLAN access</span>
                <input
                  type="number"
                  min={1}
                  max={4094}
                  value={draft.accessVlan || 1}
                  onChange={(e) => setDraft({ ...draft, accessVlan: +e.target.value })}
                />
              </label>
            )}
            {draft.mode === 'trunk' && (
              <fieldset className="vlan-checks">
                <legend>VLAN-y zgodności — pusta lista: wszystkie</legend>
                {network.vlans.map((v) => (
                  <label key={v.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!draft.allowedVlans?.includes(v.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          allowedVlans: e.target.checked
                            ? [...(draft.allowedVlans || []), v.id]
                            : draft.allowedVlans?.filter((id) => id !== v.id),
                        })
                      }
                    />
                    VLAN {v.id}
                  </label>
                ))}
              </fieldset>
            )}
          </details>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <button className="secondary" type="button" onClick={close}>
            Anuluj
          </button>
          <button className="primary" type="submit">
            <Check /> Zapisz porty i kabel
          </button>
        </footer>
      </form>
    </Modal>
  );
}
