import { SettingsSection } from '../components/SettingsSection';
import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { DnsResolvers } from './DnsEditor';
import { isDhcpServer, isRoutingDevice, numberIp, subnet } from '../model/network';
import type { Network, Vlan } from '../model/networkTypes';
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
      <SettingsSection title="2. Brama i routing" description="Kto łączy tę podsieć z pozostałymi?">
        <label className="field">
          <span>
            Urządzenie bramy / interfejs L3 (SVI) <FieldHelp topic="svi" />
          </span>
          <select
            title={fieldTips.svi}
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
      </SettingsSection>
      <SettingsSection
        title="3. Przydzielanie adresów DHCP"
        tone="green"
        description="Włącz, jeśli klienci mają otrzymywać konfigurację automatycznie."
      >
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
                <span>
                  Serwer rozdający adresy <FieldHelp topic="dhcp" />
                </span>
                <select
                  title={fieldTips.dhcp}
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
                <span>
                  Relay DHCP (inna domena L2) <FieldHelp topic="relay" />
                </span>
                <select
                  title={fieldTips.relay}
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
                <span>
                  Początek puli <FieldHelp topic="pool" />
                </span>
                <input
                  title={fieldTips.pool}
                  className="mono"
                  value={v.dhcpStart || ''}
                  onChange={(e) => patch({ dhcpStart: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Koniec puli <FieldHelp topic="pool" />
                </span>
                <input
                  title={fieldTips.pool}
                  className="mono"
                  value={v.dhcpEnd || ''}
                  onChange={(e) => patch({ dhcpEnd: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Dzierżawa (min) <FieldHelp topic="lease" />
                </span>
                <input
                  title={fieldTips.lease}
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
      </SettingsSection>
      <SettingsSection
        title="4. Rozwiązywanie nazw DNS"
        tone="purple"
        description="Potrzebne do testów nazw; po zmianie opcji DHCP odnów dzierżawy."
      >
        <DnsResolvers
          network={network}
          value={v.dnsServerIds || []}
          change={(dnsServerIds) => patch({ dnsServerIds })}
        />
        <p className="field-hint">
          DNS jest przekazywany klientom przy odnowieniu DHCP. Odnów dzierżawę w menu urządzenia po
          zmianie resolverów.
        </p>
      </SettingsSection>
      <p className="field-hint">
        L2 przenosi VLAN-y i broadcast DHCP. Routing, brama/SVI i relay wymagają urządzenia L3. DHCP
        w tej samej sieci jest usługą lokalną (UDP 67/68); relay wymaga trasy i zezwolenia UDP/67.
      </p>
    </div>
  );
}
