import { Plus, Trash } from '@phosphor-icons/react';
import type { Device, DnsRecord, Network } from './network';
export function DnsEditor({
  device,
  network,
  patch,
}: {
  device: Device;
  network: Network;
  patch: (p: Partial<Device>) => void;
}) {
  const records = device.dnsRecords || [];
  function update(id: string, p: Partial<DnsRecord>) {
    patch({ dnsRecords: records.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Strefa DNS · rekordy A</h3>
          <p>
            Nazwy można wskazywać jako cel komunikacji. Zapytania muszą dotrzeć do tego serwera
            przez UDP/53.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            patch({
              dnsRecords: [
                ...records,
                { id: crypto.randomUUID(), name: 'nowy.lab.home.arpa', address: '192.168.20.20' },
              ],
            })
          }
        >
          <Plus /> Dodaj rekord A
        </button>
      </div>
      {records.map((r) => (
        <div className="dns-record-row" key={r.id}>
          <label className="field">
            <span>Nazwa DNS</span>
            <input
              value={r.name}
              placeholder="npm.lab.home.arpa"
              onChange={(e) => update(r.id, { name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Cel rekordu</span>
            <select
              value={r.deviceId || '__ip'}
              onChange={(e) =>
                update(
                  r.id,
                  e.target.value === '__ip'
                    ? { deviceId: undefined, address: r.address || '' }
                    : { deviceId: e.target.value, address: undefined },
                )
              }
            >
              <option value="__ip">Własny adres IPv4</option>
              {network.devices
                .filter((d) => d.ip || d.ipMode === 'auto')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.ip || 'oczekuje na DHCP'}
                  </option>
                ))}
            </select>
            {!r.deviceId && (
              <input
                className="mono"
                aria-label={`IPv4 rekordu ${r.name}`}
                value={r.address || ''}
                placeholder="192.168.20.20"
                onChange={(e) => update(r.id, { address: e.target.value })}
              />
            )}
          </label>
          <button
            className="icon-button"
            type="button"
            aria-label={`Usuń rekord ${r.name}`}
            onClick={() => patch({ dnsRecords: records.filter((x) => x.id !== r.id) })}
          >
            <Trash />
          </button>
        </div>
      ))}
      {!records.length && (
        <p className="empty-inline">
          Dodaj nazwy urządzeń i usług, np. hyperv.lab.home.arpa lub npm.lab.home.arpa.
        </p>
      )}
      <p className="field-hint">
        Cel „urządzenie” śledzi jego aktualny adres. Utrata adresu daje brak rekordu A, a wyłączenie
        hosta nie usuwa jego statycznej nazwy. Model obejmuje rekordy A; bez rekurencji, DNSSEC i
        cache TTL.
      </p>
    </section>
  );
}
export function DnsResolvers({
  network,
  value,
  change,
}: {
  network: Network;
  value: string[];
  change: (ids: string[]) => void;
}) {
  const servers = network.devices.filter((d) => d.kind === 'dns' || d.dnsRecords !== undefined);
  return (
    <fieldset className="vlan-checks dns-resolver-list">
      <legend>Resolvery DNS</legend>
      {servers.map((d) => (
        <label className="checkbox-label" key={d.id}>
          <input
            type="checkbox"
            checked={value.includes(d.id)}
            onChange={(e) =>
              change(e.target.checked ? [...value, d.id] : value.filter((id) => id !== d.id))
            }
          />
          {d.name}
          <small>{d.ip || 'DHCP'}</small>
        </label>
      ))}
      {!servers.length && <p className="field-hint">Dodaj serwer DNS z biblioteki urządzeń.</p>}
    </fieldset>
  );
}
