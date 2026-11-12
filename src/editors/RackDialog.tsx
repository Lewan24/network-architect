import { useState, type FormEvent } from 'react';
import { RackPreviewDialog } from './RackPreviewDialog';
import { Modal } from '../components/Modal';
import { kinds } from '../devices/deviceCatalog';
import {
  canMountInRack,
  defaultRackHeight,
  firstRackSlot,
  fitsInRack,
  validateRack,
} from '../model/racks';
import type { Device, Network, RackMount } from '../model/networkTypes';

export function RackDialog({
  device,
  network,
  save,
  close,
}: {
  device: Device;
  network: Network;
  save: (device: Device) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(device));
  const [selected, setSelected] = useState('');
  const [candidate, setCandidate] = useState('');
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const rack = draft.rack!;
  const mount = rack.mounts.find((m) => m.deviceId === selected);
  const mountedDevice = network.devices.find((d) => d.id === selected);
  const available = network.devices.filter(
    (d) =>
      canMountInRack(d) &&
      !rack.mounts.some((m) => m.deviceId === d.id) &&
      !network.devices.some(
        (r) => r.id !== draft.id && r.rack?.mounts.some((m) => m.deviceId === d.id),
      ),
  );
  const usedU = rack.mounts.reduce((sum, m) => sum + m.heightU, 0);

  function updateMount(next: RackMount) {
    if (!fitsInRack(rack.heightU, rack.mounts, next)) {
      setError('Brak miejsca: pozycja wychodzi poza szafę lub koliduje z innym urządzeniem.');
      return;
    }
    setDraft({
      ...draft,
      rack: { ...rack, mounts: rack.mounts.map((m) => (m.deviceId === next.deviceId ? next : m)) },
    });
    setError('');
  }
  function add() {
    const target = available.find((d) => d.id === candidate);
    if (!target) return;
    const heightU = defaultRackHeight(target.kind);
    const startU = firstRackSlot(rack.heightU, rack.mounts, heightU);
    if (startU === undefined) {
      setError(`Brak wolnego miejsca na urządzenie ${heightU}U.`);
      return;
    }
    setDraft({
      ...draft,
      rack: {
        ...rack,
        mounts: [...rack.mounts, { deviceId: target.id, startU, heightU, description: '' }],
      },
    });
    setSelected(target.id);
    setCandidate('');
    setError('');
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!draft.name.trim()) throw Error('Podaj nazwę szafy.');
      const next = { ...draft, name: draft.name.trim() };
      validateRack(next, {
        ...network,
        devices: network.devices.map((d) => (d.id === next.id ? next : d)),
      });
      save(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (previewOpen)
    return (
      <RackPreviewDialog
        device={draft}
        network={network}
        selected={selected}
        select={setSelected}
        move={updateMount}
        error={error}
        close={() => setPreviewOpen(false)}
        edit={() => setPreviewOpen(false)}
      />
    );
  return (
    <Modal
      title={`Szafa RACK: ${device.name}`}
      description="Konfiguracja szafy i montaż urządzeń"
      wide
      close={close}
    >
      <form onSubmit={submit}>
        <div className="dialog-body">
          <div className="rack-settings">
            <label className="field">
              <span>Nazwa szafy</span>
              <input
                autoFocus
                required
                maxLength={40}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Wysokość szafy (U)</span>
              <input
                type="number"
                min={1}
                max={60}
                required
                value={rack.heightU}
                onChange={(e) => {
                  const heightU = e.target.valueAsNumber;
                  if (!Number.isInteger(heightU) || heightU < 1 || heightU > 60) {
                    setError('Wysokość szafy: 1–60 U.');
                    return;
                  }
                  if (rack.mounts.some((m) => m.startU + m.heightU - 1 > heightU)) {
                    setError('Przed zmniejszeniem szafy przenieś urządzenia z górnych pozycji.');
                    return;
                  }
                  setDraft({ ...draft, rack: { ...rack, heightU } });
                  setError('');
                }}
              />
            </label>
          </div>
          <div className="rack-layout">
            <section className="rack-overview" aria-label="Podsumowanie szafy">
              <h3>Układ szafy</h3>
              <p className="rack-capacity">
                <strong>{usedU}U</strong> zajęte z {rack.heightU}U
              </p>
              <progress value={usedU} max={rack.heightU} aria-label="Zajętość szafy" />
              <p className="field-hint">
                {rack.heightU - usedU}U wolne · {rack.mounts.length} urządzeń
              </p>
              <button type="button" className="primary" onClick={() => setPreviewOpen(true)}>
                Podgląd szafy
              </button>
              <p className="field-hint">
                Otwórz osobny widok od przodu. W podglądzie możesz wybierać i przeciągać urządzenia
                między jednostkami U.
              </p>
              <ul className="rack-inventory">
                {[...rack.mounts]
                  .sort((a, b) => b.startU - a.startU)
                  .map((m) => (
                    <li key={m.deviceId}>
                      <button
                        type="button"
                        aria-pressed={selected === m.deviceId}
                        onClick={() => setSelected(m.deviceId)}
                      >
                        <span>U{m.startU}</span>
                        <strong>{network.devices.find((d) => d.id === m.deviceId)?.name}</strong>
                        <span>{m.heightU}U</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
            <section className="rack-inspector" aria-label="Urządzenia w szafie">
              <h3>Zamontuj urządzenie</h3>
              <label className="field">
                <span>Urządzenie z projektu</span>
                <select value={candidate} onChange={(e) => setCandidate(e.target.value)}>
                  <option value="">Wybierz urządzenie</option>
                  {available.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {kinds[d.kind].label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" type="button" disabled={!candidate} onClick={add}>
                Dodaj do szafy
              </button>
              {!available.length && (
                <p className="field-hint">
                  Dodaj sprzęt na planszę lub zwolnij jego montaż w innej szafie.
                </p>
              )}
              <p className="field-hint">
                Sprzęt wolnostojący (np. mini PC) zajmuje miejsce na półce. Przypisanie nie tworzy
                kabla ani zasilania.
              </p>
              <h3>Rozmieszczenie</h3>
              <label className="field">
                <span>Wybrane urządzenie</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Wybierz z widoku szafy</option>
                  {[...rack.mounts]
                    .sort((a, b) => b.startU - a.startU)
                    .map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        U{m.startU} · {network.devices.find((d) => d.id === m.deviceId)?.name} ·{' '}
                        {m.heightU}U
                      </option>
                    ))}
                </select>
              </label>
              {mount && mountedDevice ? (
                <>
                  <p>
                    <strong>{mountedDevice.name}</strong>
                    <br />
                    <span className="field-hint">
                      {kinds[mountedDevice.kind].label} · {mountedDevice.ip || 'Brak adresu IP'}
                    </span>
                  </p>
                  <div className="rack-settings">
                    <label className="field">
                      <span>Dolna pozycja U</span>
                      <input
                        type="number"
                        min={1}
                        max={rack.heightU}
                        value={mount.startU}
                        onChange={(e) => updateMount({ ...mount, startU: e.target.valueAsNumber })}
                      />
                    </label>
                    <label className="field">
                      <span>Wysokość (U)</span>
                      <input
                        type="number"
                        min={1}
                        max={rack.heightU}
                        value={mount.heightU}
                        onChange={(e) => updateMount({ ...mount, heightU: e.target.valueAsNumber })}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Opis / rola / półka</span>
                    <input
                      maxLength={160}
                      value={mount.description}
                      placeholder="Np. Proxmox · host produkcyjny"
                      onChange={(e) => updateMount({ ...mount, description: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        rack: {
                          ...rack,
                          mounts: rack.mounts.filter((m) => m.deviceId !== selected),
                        },
                      });
                      setSelected('');
                      setError('');
                    }}
                  >
                    Wyjmij z szafy
                  </button>
                  <p className="field-hint">Urządzenie i jego połączenia pozostaną na planszy.</p>
                </>
              ) : (
                <p className="field-hint">
                  Wybierz urządzenie w szafie, aby zmienić jego pozycję, wysokość i opis.
                </p>
              )}
            </section>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <span>Montaż zapiszesz razem z układem szafy.</span>
          <button type="button" className="secondary" onClick={close}>
            Anuluj
          </button>
          <button className="primary" type="submit">
            Zapisz układ szafy
          </button>
        </footer>
      </form>
    </Modal>
  );
}
