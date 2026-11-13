import { useMemo } from 'react';
import { Modal } from '../components/Modal';
import type { Network } from '../model/networkTypes';
import { simulateNetwork } from './networkEngine';
import { runningServices } from './deviceStatus';
export function NetworkScanDialog({
  network,
  source,
  close,
}: {
  network: Network;
  source: string;
  close: () => void;
}) {
  const rows = useMemo(
    () =>
      network.devices
        .filter((d) => d.id !== source && d.kind !== 'rack')
        .map((d) => {
          const ping = simulateNetwork(network, {
            source,
            destination: d.id,
            protocol: 'ICMP',
            port: 0,
            checkReply: true,
          });
          const ports = runningServices(d).filter(
            (s) =>
              simulateNetwork(network, {
                source,
                destination: d.id,
                protocol: s.protocol,
                port: s.port,
                checkReply: true,
              }).ok,
          );
          return { d, ping, ports };
        }),
    [network, source],
  );
  return (
    <Modal
      title="Test nmap · skan sieci"
      description={`Perspektywa klienta: ${network.devices.find((d) => d.id === source)?.name}. Symulacja ICMP i portów usług TCP/UDP z uwzględnieniem reguł sieci.`}
      close={close}
      wide
    >
      <div className="dialog-body">
        <p>
          Skan obejmuje urządzenia projektu i skonfigurowane usługi. Brak odpowiedzi ping nie
          wyklucza dostępu do portów. To symulacja, bez wysyłania pakietów do rzeczywistej sieci.
        </p>
        <table>
          <thead>
            <tr>
              <th>Urządzenie</th>
              <th>Ping</th>
              <th>Dostępne porty / usługi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, ping, ports }) => (
              <tr key={d.id}>
                <td>
                  {d.name} ({d.ip || 'brak IP'})
                </td>
                <td title={ping.reason}>{ping.ok ? '🟢 Odpowiada' : '🔴 Brak odpowiedzi'}</td>
                <td>
                  {ports.map((s) => `${s.port}/${s.protocol}`).join(', ') ||
                    'Brak dostępnych usług'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
