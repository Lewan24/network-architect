import type { Device, Network } from '../model/networkTypes';

/** One option per device, grouped by its primary/management VLAN. Values remain caller-owned. */
export function DeviceOptions({
  network,
  devices,
  valueFor = (d) => d.id,
  labelFor = (d) =>
    `${d.name} · ${d.ip || (d.ipMode === 'auto' ? 'oczekuje na DHCP' : 'bez adresu IP')}`,
}: {
  network: Pick<Network, 'vlans'>;
  devices: Device[];
  valueFor?: (device: Device) => string;
  labelFor?: (device: Device) => string;
}) {
  const vlans = [...new Set(devices.map((d) => d.vlan))].sort((a, b) =>
    a === 0 ? 1 : b === 0 ? -1 : a - b,
  );
  return (
    <>
      {vlans.map((id) => {
        const vlan = network.vlans.find((v) => v.id === id);
        const label =
          id === 0
            ? 'Urządzenia · WAN / bez VLAN-u'
            : `Urządzenia · VLAN ${id}${vlan ? ` · ${vlan.name}` : ' · brak definicji sieci'}`;
        return (
          <optgroup key={id} label={label}>
            {devices
              .filter((d) => d.vlan === id)
              .sort(
                (a, b) =>
                  a.name.localeCompare(b.name, 'pl', { numeric: true }) || a.id.localeCompare(b.id),
              )
              .map((d) => (
                <option key={d.id} value={valueFor(d)}>
                  {labelFor(d)}
                </option>
              ))}
          </optgroup>
        );
      })}
    </>
  );
}
