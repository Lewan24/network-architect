import { Check, Info, Plus, Trash, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { applyVlans } from './network';
import { ScopeFields } from './NetworkScopes';
import type { Network, Vlan } from './networkTypes';
export function Modal({
  title,
  description,
  children,
  close,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < box.left ||
          e.clientX > box.right ||
          e.clientY < box.top ||
          e.clientY > box.bottom
        )
          close();
      }}
    >
      <header className="dialog-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button className="icon-button" type="button" onClick={close} aria-label="Zamknij dialog">
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
export function VlanDialog({
  network,
  save,
  close,
}: {
  network: Network;
  save: (network: Network) => void;
  close: () => void;
}) {
  const [rows, setRows] = useState(() =>
    network.vlans.map((v) => ({ key: crypto.randomUUID(), vlan: { ...v } })),
  );
  const [error, setError] = useState('');
  function patch(key: string, value: Partial<Vlan>) {
    setRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, vlan: { ...r.vlan, ...value } } : r)),
    );
    setError('');
  }
  function add() {
    let id = 10;
    while (rows.some((r) => r.vlan.id === id)) id += 10;
    while (rows.some((r) => r.vlan.id === id)) id++;
    if (id > 4094) id = 1;
    setRows((r) => [
      ...r,
      {
        key: crypto.randomUUID(),
        vlan: {
          id,
          name: `VLAN ${id}`,
          cidr: `10.0.${Math.min(254, id)}.0/24`,
          gateway: `10.0.${Math.min(254, id)}.1`,
          color: '#a491b4',
        },
      },
    ]);
    setError('');
  }
  return (
    <Modal
      title="Sieci i VLAN-y"
      description="Wspólne podsieci i pule adresów dla całego projektu"
      close={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            save(
              applyVlans(
                network,
                rows.map((r) => r.vlan),
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="dialog-body">
          <div className="section-heading">
            <p>
              DHCP przydziela adres dopiero po znalezieniu aktywnego serwera w sieci L2 lub przez
              relay.
            </p>
            <button type="button" className="secondary" onClick={add}>
              <Plus /> Dodaj VLAN
            </button>
          </div>
          <div className="vlan-list">
            {rows.map(({ key, vlan: v }) => {
              const used = network.devices.filter((d) => d.vlan === v.id).length;
              return (
                <div className="vlan-row" key={key}>
                  <div className="vlan-row-heading">
                    <input
                      type="color"
                      aria-label={`Kolor VLAN ${v.id}`}
                      value={v.color}
                      onChange={(e) => patch(key, { color: e.target.value })}
                    />
                    <strong>{v.name || 'Nowy VLAN'}</strong>
                    <span>{used} urządzeń</span>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={used > 0}
                      title={used ? 'Najpierw przenieś urządzenia do innego VLAN-u' : 'Usuń VLAN'}
                      aria-label={`Usuń VLAN ${v.id}`}
                      onClick={() => setRows((rows) => rows.filter((r) => r.key !== key))}
                    >
                      <Trash />
                    </button>
                  </div>
                  <div className="vlan-fields">
                    <label className="field">
                      <span>ID VLAN</span>
                      <input
                        type="number"
                        min="1"
                        max="4094"
                        disabled={used > 0}
                        value={v.id}
                        onChange={(e) => patch(key, { id: +e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Nazwa</span>
                      <input
                        value={v.name}
                        maxLength={40}
                        onChange={(e) => patch(key, { name: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Podsieć CIDR</span>
                      <input
                        className="mono"
                        value={v.cidr}
                        onChange={(e) => patch(key, { cidr: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Brama IPv4</span>
                      <input
                        className="mono"
                        value={v.gateway}
                        onChange={(e) => patch(key, { gateway: e.target.value })}
                      />
                    </label>
                  </div>
                  <ScopeFields vlan={v} network={network} patch={(p) => patch(key, p)} />
                </div>
              );
            })}
          </div>
          {!rows.length && (
            <div className="empty-inline">
              Brak VLAN-ów. Dodaj podsieć, aby przydzielać urządzeniom adresy automatycznie.
            </div>
          )}
          <div className="info-line">
            <Info />
            <span>
              Brama, adres sieci i broadcast są zarezerwowane. Zmiana podsieci przeliczy adresy
              automatyczne. Adresy statyczne pozostają pod Twoją kontrolą.
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <span>{rows.length} skonfigurowanych VLAN-ów</span>
          <button type="button" className="secondary" onClick={close}>
            Anuluj
          </button>
          <button type="submit" className="primary">
            <Check /> Zapisz VLAN-y
          </button>
        </footer>
      </form>
    </Modal>
  );
}
