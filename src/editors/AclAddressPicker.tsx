import type { Network } from '../model/network';
export function AclAddressPicker({
  value,
  change,
  network,
  label,
}: {
  value: string;
  change: (value: string) => void;
  network: Network;
  label: string;
}) {
  const known = value === '*' || value.startsWith('device:') || value.startsWith('vlan:');
  const available = [
    '*',
    ...network.devices.filter((d) => d.kind !== 'switch-unmanaged').map((d) => `device:${d.id}`),
    ...network.vlans.map((v) => `vlan:${v.id}`),
  ];
  return (
    <div className="acl-address-picker">
      <select
        aria-label={label}
        value={known ? value : '__ip'}
        onChange={(e) => change(e.target.value === '__ip' ? '' : e.target.value)}
      >
        <option value="*">Dowolny (any)</option>
        <optgroup label="Urządzenia — adres aktualizowany z DHCP">
          {network.devices
            .filter((d) => d.kind !== 'switch-unmanaged')
            .map((d) => (
              <option key={d.id} value={`device:${d.id}`}>
                {d.name} · {d.ip || 'czeka na DHCP'}
              </option>
            ))}
        </optgroup>
        <optgroup label="Całe sieci / VLAN-y">
          {network.vlans.map((v) => (
            <option key={v.id} value={`vlan:${v.id}`}>
              {v.name} · VLAN {v.id} · {v.cidr}
            </option>
          ))}
        </optgroup>
        {known && !available.includes(value) && (
          <option value={value}>Usunięty obiekt — reguła nie pasuje</option>
        )}
        <option value="__ip">Własny IP / podsieć CIDR…</option>
      </select>
      {!known && (
        <input
          className="mono"
          aria-label={`${label}: adres lub CIDR`}
          placeholder="10.0.0.1 lub 10.0.0.0/24"
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </div>
  );
}
