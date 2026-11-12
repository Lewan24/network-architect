import '../styles/rack-preview.css';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Modal } from '../components/Modal';
import { kinds } from '../devices/deviceCatalog';
import type { Device, Network, RackMount } from '../model/networkTypes';

function EquipmentFront({ device, mount }: { device: Device; mount: RackMount }) {
  const switching =
    device.kind.startsWith('switch') || ['router', 'gateway', 'firewall'].includes(device.kind);
  const storage = ['server', 'nvr', 'dns', 'radius'].includes(device.kind);
  return (
    <>
      <span className="rack-ear" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="rack-front-content">
        <span className="rack-front-label">
          <strong>{device.name}</strong>
          <span>{mount.heightU}U</span>
        </span>
        <span
          className={`rack-front-hardware ${switching ? 'network' : storage ? 'storage' : device.kind === 'ups' ? 'battery' : 'compute'}`}
          aria-hidden="true"
        >
          {switching ? (
            <span className="rack-front-ports">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </span>
          ) : storage ? (
            <span className="rack-front-drives">
              {Array.from({ length: 4 }, (_, i) => (
                <i key={i}>
                  <b />
                </i>
              ))}
            </span>
          ) : device.kind === 'ups' ? (
            <span className="rack-front-display">
              UPS<span>AC</span>
            </span>
          ) : (
            <span className="rack-front-vents" />
          )}
          <span className="rack-front-status">
            <i className={device.online ? 'on' : ''} />
            <i />
            <b />
          </span>
        </span>
        {mount.heightU > 1 && (
          <span className="rack-front-description">
            {mount.description || kinds[device.kind].label}
          </span>
        )}
      </span>
      <span className="rack-ear" aria-hidden="true">
        <i />
        <i />
      </span>
    </>
  );
}

export function RackPreviewDialog({
  device,
  network,
  selected,
  select,
  move,
  error,
  close,
  edit,
}: {
  device: Device;
  network: Network;
  selected: string;
  select: (id: string) => void;
  move: (mount: RackMount) => void;
  error: string;
  close: () => void;
  edit: () => void;
}) {
  const rack = device.rack!;
  const [dragging, setDragging] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const selectedElement = useRef<HTMLButtonElement>(null);
  const mount = rack.mounts.find((m) => m.deviceId === selected);
  const member = network.devices.find((d) => d.id === selected);
  useEffect(() => {
    if (detail) selectedElement.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, mount?.startU, detail]);
  const usedU = rack.mounts.reduce((sum, m) => sum + m.heightU, 0);
  function dropAt(u: number) {
    const moving = rack.mounts.find((m) => m.deviceId === dragging);
    if (moving) move({ ...moving, startU: u });
    setDragging(null);
  }
  return (
    <Modal
      title={`Podgląd szafy · ${device.name}`}
      description={`${rack.heightU}U · widok od przodu · U1 na dole`}
      wide
      close={close}
    >
      <div className="rack-preview">
        <div className="rack-preview-toolbar">
          <p>
            <strong>{rack.mounts.length} urządzeń</strong>
            <span>
              {usedU}U zajęte · {rack.heightU - usedU}U wolne
            </span>
          </p>
          <div role="group" aria-label="Skala podglądu">
            <button type="button" aria-pressed={!detail} onClick={() => setDetail(false)}>
              Cała szafa
            </button>
            <button type="button" aria-pressed={detail} onClick={() => setDetail(true)}>
              Szczegóły
            </button>
          </div>
        </div>
        <div className="rack-preview-layout">
          <section
            className={`rack-stage ${detail ? 'detail' : ''}`}
            aria-label={`Widok szafy ${rack.heightU}U`}
            style={{ '--rack-units': rack.heightU } as CSSProperties}
          >
            <div className="rack-cabinet">
              <div className="rack-cabinet-crown">
                <span>19″</span>
                <strong>{device.name}</strong>
                <span>{rack.heightU}U</span>
              </div>
              <div className="rack-cabinet-body">
                <div className="rack-cabinet-rail left" aria-hidden="true" />
                <div className="rack-cabinet-bay">
                  {Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i).map((u) => (
                    <button
                      type="button"
                      key={u}
                      className={`rack-preview-unit ${dragging ? 'droppable' : ''}`}
                      style={{ top: `calc((${rack.heightU} - ${u}) * var(--rack-unit-height))` }}
                      aria-label={`U${u}${mount ? ' · przenieś wybrane urządzenie' : ''}`}
                      title={`U${u}`}
                      onClick={() => {
                        if (mount) move({ ...mount, startU: u });
                      }}
                      onDragOver={(e) => {
                        if (dragging) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        dropAt(u);
                      }}
                    >
                      <span>{u.toString().padStart(2, '0')}</span>
                      <i />
                      <span />
                      <i />
                    </button>
                  ))}
                  {rack.mounts.map((m) => {
                    const d = network.devices.find((d) => d.id === m.deviceId);
                    if (!d) return null;
                    return (
                      <button
                        type="button"
                        draggable
                        key={m.deviceId}
                        ref={selected === m.deviceId ? selectedElement : undefined}
                        className={`rack-equipment ${selected === m.deviceId ? 'selected' : ''} ${m.heightU === 1 ? 'single-unit' : ''} ${d.kind === 'ups' ? 'ups' : ''}`}
                        style={{
                          top: `calc((${rack.heightU} - ${m.startU} - ${m.heightU} + 1) * var(--rack-unit-height) + 1px)`,
                          height: `calc(${m.heightU} * var(--rack-unit-height) - 2px)`,
                        }}
                        aria-pressed={selected === m.deviceId}
                        aria-label={`${d.name}, ${m.heightU}U, od U${m.startU}. Strzałki w górę i w dół zmieniają pozycję.`}
                        title={`${d.name} · U${m.startU}–U${m.startU + m.heightU - 1} · ${m.description || kinds[d.kind].label}`}
                        onClick={() => select(m.deviceId)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            select(m.deviceId);
                            move({ ...m, startU: m.startU + (e.key === 'ArrowUp' ? 1 : -1) });
                          }
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/netweave-rack', m.deviceId);
                          e.dataTransfer.effectAllowed = 'move';
                          select(m.deviceId);
                          setDragging(m.deviceId);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(e) => {
                          if (dragging) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          dropAt(m.startU);
                        }}
                      >
                        <EquipmentFront device={d} mount={m} />
                      </button>
                    );
                  })}
                </div>
                <div className="rack-cabinet-rail right" aria-hidden="true">
                  <span className="rack-door-handle" />
                </div>
              </div>
              <div className="rack-cabinet-plinth">
                <span />
                <i />
                <span />
              </div>
              <div className="rack-cabinet-feet" aria-hidden="true">
                <i />
                <i />
              </div>
            </div>
          </section>
          <aside className="rack-preview-info">
            <h3>{member && mount ? member.name : 'Wnętrze szafy'}</h3>
            {mount && member ? (
              <>
                <p>{kinds[member.kind].label}</p>
                <dl>
                  <div>
                    <dt>Pozycja</dt>
                    <dd>
                      U{mount.startU}–U{mount.startU + mount.heightU - 1}
                    </dd>
                  </div>
                  <div>
                    <dt>Wysokość</dt>
                    <dd>{mount.heightU}U</dd>
                  </div>
                  <div>
                    <dt>Stan urządzenia</dt>
                    <dd>{member.online ? 'Włączone' : 'Wyłączone'}</dd>
                  </div>
                  <div>
                    <dt>Adres IP</dt>
                    <dd>{member.ip || 'Brak adresu'}</dd>
                  </div>
                </dl>
                <p className="rack-preview-note">{mount.description || 'Brak opisu montażu.'}</p>
                <button type="button" className="secondary" onClick={edit}>
                  Edytuj montaż i opis
                </button>
                <button type="button" className="secondary" onClick={() => select('')}>
                  Odznacz urządzenie
                </button>
              </>
            ) : (
              <p>
                Wybierz urządzenie, aby zobaczyć jego pozycję, wysokość i opis.
                {rack.mounts.length === 0
                  ? ' Szafa jest pusta — dodaj sprzęt w ustawieniach montażu.'
                  : ''}
              </p>
            )}
            <p className="field-hint">
              Przeciągnij blok na docelowe U lub użyj strzałek na klawiaturze. Montaż pozostaje
              niezależny od połączeń sieciowych.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </aside>
        </div>
      </div>
      <footer className="dialog-footer">
        <span>Zmiany montażu zatwierdzisz w ustawieniach szafy.</span>
        <button type="button" className="primary" onClick={close}>
          Wróć do ustawień
        </button>
      </footer>
    </Modal>
  );
}
