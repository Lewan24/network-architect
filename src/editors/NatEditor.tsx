import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { Info, Plus, Trash } from '@phosphor-icons/react';
import type { Device, Network, PortForward, StaticNat } from '../model/networkTypes';

export function NatEditor({
  device: d,
  network,
  patch,
}: {
  device: Device;
  network: Network;
  patch: (p: Partial<Device>) => void;
}) {
  const pf = d.portForwards || [];
  const nat = d.staticNat || [];
  const target = network.devices.find((x) => ['server', 'vm', 'workstation'].includes(x.kind));
  function forward(id: string, p: Partial<PortForward>) {
    patch({ portForwards: pf.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }
  function staticNat(id: string, p: Partial<StaticNat>) {
    patch({ staticNat: nat.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }
  const listId = `nat-targets-${d.id}`;
  return (
    <section>
      <datalist id={listId}>
        {network.devices
          .filter((x) => x.ip)
          .map((x) => (
            <option key={x.id} value={x.ip}>
              {x.name}
            </option>
          ))}
      </datalist>
      <div className="section-heading">
        <div>
          <h3>Port forwarding</h3>
          <p>Publikacja usługi: publiczny IP i port → prywatny IP i port.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            patch({
              portForwards: [
                ...pf,
                {
                  id: crypto.randomUUID(),
                  protocol: 'TCP',
                  externalIp: d.wanIp || d.ip,
                  externalPort: 443,
                  internalIp: target?.ip || '10.0.20.10',
                  internalPort: 443,
                  enabled: true,
                },
              ],
            })
          }
        >
          <Plus /> Dodaj przekierowanie
        </button>
      </div>
      <div className="nat-rules">
        {pf.map((r, i) => (
          <div className="nat-rule" key={r.id}>
            <div className="nat-rule-header">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => forward(r.id, { enabled: e.target.checked })}
                />{' '}
                Przekierowanie {i + 1}
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label="Usuń przekierowanie"
                onClick={() => patch({ portForwards: pf.filter((x) => x.id !== r.id) })}
              >
                <Trash />
              </button>
            </div>
            <div className="forward-fields">
              <label className="field">
                <span>Protokół</span>
                <select
                  value={r.protocol}
                  onChange={(e) =>
                    forward(r.id, { protocol: e.target.value as PortForward['protocol'] })
                  }
                >
                  <option>TCP</option>
                  <option>UDP</option>
                </select>
              </label>
              <label className="field">
                <span>
                  Publiczny IP <FieldHelp topic="nat" />
                </span>
                <input
                  title={fieldTips.nat}
                  value={r.externalIp}
                  onChange={(e) => forward(r.id, { externalIp: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Port WAN <FieldHelp topic="nat" />
                </span>
                <input
                  title={fieldTips.nat}
                  type="number"
                  min={1}
                  max={65535}
                  value={r.externalPort}
                  onChange={(e) => forward(r.id, { externalPort: +e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Prywatny IP <FieldHelp topic="nat" />
                </span>
                <input
                  title={fieldTips.nat}
                  list={listId}
                  value={r.internalIp}
                  onChange={(e) => forward(r.id, { internalIp: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Port LAN <FieldHelp topic="nat" />
                </span>
                <input
                  title={fieldTips.nat}
                  type="number"
                  min={1}
                  max={65535}
                  value={r.internalPort}
                  onChange={(e) => forward(r.id, { internalPort: +e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      {!pf.length && <p className="empty-inline">Brak opublikowanych usług.</p>}
      <div className="section-heading nat-section">
        <div>
          <h3>Static NAT · mapowanie 1:1</h3>
          <p>DNAT dla wejścia i SNAT przy wyjściu do internetu, dla wszystkich protokołów.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            patch({
              staticNat: [
                ...nat,
                {
                  id: crypto.randomUUID(),
                  publicIp: d.wanIp || d.ip,
                  privateIp: target?.ip || '10.0.20.10',
                  enabled: true,
                },
              ],
            })
          }
        >
          <Plus /> Dodaj static NAT
        </button>
      </div>
      {nat.map((r, i) => (
        <div className="static-nat-row" key={r.id}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => staticNat(r.id, { enabled: e.target.checked })}
            />
            #{i + 1}
          </label>
          <label className="field">
            <span>Publiczny IPv4</span>
            <input
              value={r.publicIp}
              onChange={(e) => staticNat(r.id, { publicIp: e.target.value })}
            />
          </label>
          <span className="nat-arrow">↔</span>
          <label className="field">
            <span>Prywatny IPv4</span>
            <input
              list={listId}
              value={r.privateIp}
              onChange={(e) => staticNat(r.id, { privateIp: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Usuń static NAT"
            onClick={() => patch({ staticNat: nat.filter((x) => x.id !== r.id) })}
          >
            <Trash />
          </button>
        </div>
      ))}
      {!nat.length && <p className="empty-inline">Brak mapowań adresów 1:1.</p>}
      <p className="info-line">
        <Info />
        Przekierowanie portu ma pierwszeństwo przed static NAT. NAT nie omija ACL. Aby przetestować
        publikację, w panelu symulacji wybierz cel „Adres IPv4”.
      </p>
    </section>
  );
}
