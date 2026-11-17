import type { Device, Network } from '../model/networkTypes';
import { SettingsSection } from '../components/SettingsSection';
import { wirelessAssociation } from '../model/wifi';

export function WifiClientEditor({
  device,
  network,
  patch,
}: {
  device: Device;
  network: Network;
  patch: (value: Partial<Device>) => void;
}) {
  const ports = device.ports?.filter((p) => p.connector === 'wifi') || [];
  if (device.kind === 'accesspoint' || !ports.length) return null;
  return (
    <SettingsSection
      title="Połączenie Wi-Fi / PPSK"
      description="Dla SSID z PPSK wpisz hasło przypisane do docelowego VLAN-u. Klient nie wybiera VLAN-u tagiem na karcie."
    >
      {ports.map((port) => {
        const link = network.links.find(
          (l) =>
            (l.a === device.id && l.aPortId === port.id) ||
            (l.b === device.id && l.bPortId === port.id),
        );
        const association = link && wirelessAssociation(network, link);
        return (
          <div key={port.id}>
            <label className="field">
              <span>Hasło Wi-Fi / PPSK · {port.name}</span>
              <input
                type="password"
                autoComplete="new-password"
                maxLength={64}
                value={port.wifiPassword || ''}
                onChange={(e) =>
                  patch({
                    ports: device.ports!.map((p) =>
                      p.id === port.id ? { ...p, wifiPassword: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <p className="field-hint" role="status">
              {!association
                ? 'Podłącz tę kartę do portu Wi-Fi wybranego SSID na AP.'
                : association.error ||
                  `SSID „${association.ssid}” · ${association.ap.name} → VLAN ${association.vlan}${association.keyName ? ` · profil ${association.keyName}` : ' · stałe przypisanie SSID'}`}
            </p>
            {association?.ppsk !== undefined && (
              <p className="field-hint">
                Hasło jest zapisywane w projekcie. Po zmianie VLAN-u użyj DHCP albo ustaw statyczny
                IP i bramę z właściwej podsieci.
              </p>
            )}
          </div>
        );
      })}
    </SettingsSection>
  );
}
