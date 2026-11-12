import { Plus, Trash } from '@phosphor-icons/react';
import type { Device, Network, NetworkInterface } from '../model/networkTypes';
import { primaryInterface } from '../model/interfaces';
import { DnsResolvers } from './DnsEditor';
export function InterfacesEditor({
  device,
  network,
  preview,
  patch,
}: {
  device: Device;
  network: Network;
  preview: Device;
  patch: (p: Partial<Device>) => void;
}) {
  const routing = ['router', 'firewall', 'gateway', 'switch-l3'].includes(device.kind);
  const interfaces = device.interfaces || [primaryInterface(device, network)];
  function change(next: NetworkInterface[]) {
    const primary = next[0];
    patch({
      interfaces: next,
      ip: primary.ip,
      ipMode: primary.ipMode,
      vlan: primary.vlan,
      lease: primary.lease,
    });
  }
  function update(id: string, p: Partial<NetworkInterface>) {
    change(interfaces.map((n) => (n.id === id ? { ...n, ...p } : n)));
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Interfejsy IP i adresacja</h3>
          <p>
            Pierwsza karta jest główną. Wybór trasy: najdłuższy prefiks, potem metryka. Sam host nie
            routuje między kartami. Router i switch L3 rozpoznają sieci podłączone bezpośrednio.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={
            interfaces.length >= 16 ||
            !(device.ports || []).some((p) => !interfaces.some((n) => n.portId === p.id))
          }
          onClick={() => {
            const port = device.ports?.find((p) => !interfaces.some((n) => n.portId === p.id));
            if (!port) return;
            change([
              ...interfaces,
              {
                ...primaryInterface(device, network),
                id: crypto.randomUUID(),
                name: port.name,
                portId: port.id,
                ip: '',
                ipMode: routing ? 'static' : 'auto',
                lease: undefined,
                metric: 100 + interfaces.length * 10,
              },
            ]);
          }}
        >
          <Plus /> Dodaj kartę
        </button>
      </div>
      {!device.interfaces && (
        <button className="secondary" type="button" onClick={() => change(interfaces)}>
          Włącz osobną konfigurację kart
        </button>
      )}
      {interfaces.map((n, i) => {
        const resolved = preview.interfaces?.find((p) => p.id === n.id);
        return (
          <fieldset className="interface-card" key={n.id}>
            <legend>
              {i === 0 ? 'Główna · ' : ''}
              {n.name}
            </legend>
            <div className="scope-grid">
              <label className="field">
                <span>Nazwa interfejsu</span>
                <input
                  value={n.name}
                  maxLength={80}
                  onChange={(e) => update(n.id, { name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Port / karta</span>
                <select value={n.portId} onChange={(e) => update(n.id, { portId: e.target.value })}>
                  {device.ports?.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={interfaces.some((x) => x.id !== n.id && x.portId === p.id)}
                    >
                      {p.name} · {p.connector}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={n.enabled}
                onChange={(e) => update(n.id, { enabled: e.target.checked })}
              />{' '}
              Interfejs włączony
            </label>
            <div className="scope-grid">
              <label className="field">
                <span>VLAN interfejsu (ustaw też port)</span>
                <select
                  value={n.vlan}
                  onChange={(e) =>
                    update(n.id, { vlan: +e.target.value, ip: '', lease: undefined })
                  }
                >
                  <option value={0}>Bez VLAN / interfejs routowany</option>
                  {network.vlans.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Adresowanie</span>
                <select
                  value={n.ipMode}
                  onChange={(e) =>
                    update(n.id, {
                      ipMode: e.target.value as NetworkInterface['ipMode'],
                      lease: undefined,
                    })
                  }
                >
                  <option value="auto" disabled={routing}>
                    DHCP (host)
                  </option>
                  <option value="static">Statyczne</option>
                </select>
              </label>
            </div>
            {n.ipMode === 'static' ? (
              <>
                <div className="scope-grid">
                  <label className="field">
                    <span>Adres IPv4</span>
                    <input
                      value={n.ip}
                      placeholder="192.168.10.20"
                      onChange={(e) => update(n.id, { ip: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Prefiks maski</span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={n.prefix}
                      onChange={(e) => update(n.id, { prefix: +e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Brama domyślna tej karty — pusta dla sieci lokalnej</span>
                  <input
                    value={n.gateway}
                    placeholder="192.168.10.1"
                    onChange={(e) => update(n.id, { gateway: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <p className="info-line">
                {resolved?.ip || 'Oczekuje na DHCP'}
                {resolved?.lease
                  ? ` /${resolved.prefix} · brama ${resolved.gateway || 'brak'}`
                  : ''}
              </p>
            )}
            <label className="field">
              <span>Metryka trasy — niższa wygrywa</span>
              <input
                type="number"
                min={0}
                max={65535}
                value={n.metric}
                onChange={(e) => update(n.id, { metric: +e.target.value })}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={n.dnsServerIds === undefined}
                onChange={(e) => update(n.id, { dnsServerIds: e.target.checked ? undefined : [] })}
              />{' '}
              DNS z DHCP / konfiguracji hosta
            </label>
            {n.dnsServerIds !== undefined && (
              <DnsResolvers
                network={network}
                value={n.dnsServerIds}
                change={(dnsServerIds) => update(n.id, { dnsServerIds })}
              />
            )}
            {i > 0 && (
              <button
                className="secondary"
                type="button"
                onClick={() => change(interfaces.filter((x) => x.id !== n.id))}
              >
                <Trash /> Usuń kartę
              </button>
            )}
          </fieldset>
        );
      })}
      <p className="field-hint">
        W razie braku wolnego portu dodaj go w zakładce „Porty i PoE”. Maski i bramy statyczne są
        ustawieniami hosta, niezależnymi od opisu VLAN-u. DHCP przekazuje maskę i bramę w
        dzierżawie.
      </p>
    </section>
  );
}
