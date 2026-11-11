import { Info, Plus } from '@phosphor-icons/react';
import { DnsResolvers } from './DnsEditor';
import { isDhcpServer, isRoutingDevice, numberIp, subnet } from './network';
import type { Device, Network, Vlan } from './networkTypes';
export function ScopeFields({
  vlan: v,
  network,
  patch,
}: {
  vlan: Vlan;
  network: Network;
  patch: (p: Partial<Vlan>) => void;
}) {
  const routers = network.devices.filter(isRoutingDevice);
  const servers = network.devices.filter(isDhcpServer);
  function enable(enabled: boolean) {
    let start = '';
    let end = '';
    try {
      const p = subnet(v.cidr);
      start = numberIp(
        Math.min(
          p.end - 1,
          p.start + Math.min(100, Math.max(2, Math.floor((p.end - p.start) / 3))),
        ),
      );
      end = numberIp(Math.min(p.end - 1, p.start + 200));
    } catch {}
    patch({
      dhcpEnabled: enabled,
      ...(enabled
        ? {
            dhcpServerId: v.dhcpServerId || v.gatewayDeviceId || servers[0]?.id || '',
            dhcpStart: v.dhcpStart || start,
            dhcpEnd: v.dhcpEnd || end,
            leaseMinutes: v.leaseMinutes || 120,
          }
        : {}),
    });
  }
  return (
    <div className="scope-settings">
      <label className="field">
        <span>Urządzenie bramy / interfejs L3 (SVI)</span>
        <select
          value={v.gatewayDeviceId || ''}
          onChange={(e) => patch({ gatewayDeviceId: e.target.value })}
        >
          <option value="">Brak — tylko komunikacja lokalna L2</option>
          {routers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={!!v.dhcpEnabled}
          onChange={(e) => enable(e.target.checked)}
        />{' '}
        Serwer DHCP dla tej podsieci
      </label>
      {v.dhcpEnabled && (
        <>
          <div className="scope-grid">
            <label className="field">
              <span>Serwer rozdający adresy</span>
              <select
                value={v.dhcpServerId || ''}
                onChange={(e) => patch({ dhcpServerId: e.target.value })}
              >
                <option value="">Wybierz serwer DHCP</option>
                {servers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Relay DHCP (inna domena L2)</span>
              <select
                value={v.relayDeviceId || ''}
                onChange={(e) => patch({ relayDeviceId: e.target.value })}
              >
                <option value="">Bez relay — serwer w tej samej sieci L2</option>
                {routers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="scope-grid scope-pool">
            <label className="field">
              <span>Początek puli</span>
              <input
                className="mono"
                value={v.dhcpStart || ''}
                onChange={(e) => patch({ dhcpStart: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Koniec puli</span>
              <input
                className="mono"
                value={v.dhcpEnd || ''}
                onChange={(e) => patch({ dhcpEnd: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Dzierżawa (min)</span>
              <input
                type="number"
                min={1}
                max={10080}
                value={v.leaseMinutes || 120}
                onChange={(e) => patch({ leaseMinutes: +e.target.value })}
              />
            </label>
          </div>
        </>
      )}
      <DnsResolvers
        network={network}
        value={v.dnsServerIds || []}
        change={(dnsServerIds) => patch({ dnsServerIds })}
      />
      <p className="field-hint">
        DNS jest przekazywany klientom przy odnowieniu DHCP. Odnów dzierżawę w menu urządzenia po
        zmianie resolverów.
      </p>
      <p className="field-hint">
        L2 przenosi VLAN-y i broadcast DHCP. Routing, brama/SVI i relay wymagają urządzenia L3. DHCP
        w tej samej sieci jest usługą lokalną (UDP 67/68); relay wymaga trasy i zezwolenia UDP/67.
      </p>
    </div>
  );
}
export function DeviceNetworks({
  device,
  network,
  vlans,
  setVlans,
}: {
  device: Device;
  network: Network;
  vlans: Vlan[];
  setVlans: (vlans: Vlan[]) => void;
}) {
  function patch(id: number, p: Partial<Vlan>) {
    setVlans(vlans.map((v) => (v.id === id ? { ...v, ...p } : v)));
  }
  function add() {
    let id = 1;
    while (vlans.some((v) => v.id === id)) id++;
    const segment = id === 1 ? 0 : Math.min(254, id);
    setVlans([
      ...vlans,
      {
        id,
        name: id === 1 ? 'LAN domyślna' : `VLAN ${id}`,
        cidr: `192.168.${segment}.0/24`,
        gateway: `192.168.${segment}.1`,
        color: '#718fae',
        ...(isRoutingDevice(device) ? { gatewayDeviceId: device.id } : {}),
        dhcpEnabled: true,
        dhcpServerId: device.id,
        dhcpStart: `192.168.${segment}.100`,
        dhcpEnd: `192.168.${segment}.200`,
        leaseMinutes: 120,
      },
    ]);
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Sieci LAN, interfejsy VLAN i DHCP</h3>
          <p>Zmiany w tej zakładce aktualizują wspólną konfigurację sieci projektu.</p>
        </div>
        <button className="secondary" type="button" onClick={add}>
          <Plus /> Dodaj sieć LAN
        </button>
      </div>
      {vlans.map((v) => (
        <details
          className="device-scope"
          key={v.id}
          open={v.gatewayDeviceId === device.id || v.dhcpServerId === device.id}
        >
          <summary>
            <i style={{ background: v.color }} />
            {v.name} · VLAN {v.id}
            <span>{v.cidr}</span>
          </summary>
          <div className="vlan-fields">
            <label className="field">
              <span>Nazwa</span>
              <input value={v.name} onChange={(e) => patch(v.id, { name: e.target.value })} />
            </label>
            <label className="field">
              <span>Podsieć CIDR</span>
              <input value={v.cidr} onChange={(e) => patch(v.id, { cidr: e.target.value })} />
            </label>
            <label className="field">
              <span>Adres bramy / SVI</span>
              <input value={v.gateway} onChange={(e) => patch(v.id, { gateway: e.target.value })} />
            </label>
          </div>
          <ScopeFields
            vlan={v}
            network={{
              ...network,
              devices: network.devices.map((d) => (d.id === device.id ? device : d)),
            }}
            patch={(p) => patch(v.id, p)}
          />
        </details>
      ))}
      {!vlans.length && (
        <p className="empty-inline">Dodaj pierwszą sieć LAN, np. 192.168.0.0/24.</p>
      )}
      <p className="info-line">
        <Info />
        Wskazanie bramy tworzy logiczny interfejs L3 tej sieci na wybranym urządzeniu. VLAN-y na
        switchu L2 potrzebują takiej bramy na routerze albo switchu L3. Domyślne deny any pozostaje
        aktywne — ruch użytkowników wymaga jawnej reguły permit.
      </p>
    </section>
  );
}
