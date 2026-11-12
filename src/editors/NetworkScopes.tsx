import { Info } from '@phosphor-icons/react';
import { VlanCards } from './VlanCards';
import type { Device, Network, Vlan } from '../model/networkTypes';
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
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Sieci LAN, interfejsy VLAN i DHCP</h3>
          <p>Otwórz kartę sieci. Zmiany zatwierdzisz razem z konfiguracją urządzenia.</p>
        </div>
      </div>
      <VlanCards
        network={{
          ...network,
          vlans,
          devices: network.devices.map((d) => (d.id === device.id ? device : d)),
        }}
        device={device}
        change={setVlans}
      />
      <p className="info-line">
        <Info /> Wskazanie bramy tworzy logiczny interfejs L3 tej sieci. Ruch między VLAN-ami wymaga
        routingu i odpowiednich reguł ACL.
      </p>
    </section>
  );
}
