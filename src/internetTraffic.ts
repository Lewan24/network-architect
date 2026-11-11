import { internetConnection, internetTargets } from './internetModel';
import type { Network, Probe } from './networkTypes';
export function internetProbe(network: Network, random = Math.random): Probe | null {
  const state = internetConnection(network);
  const source = state.internet;
  const addresses = internetTargets(network);
  if (!source || !addresses.length) return null;
  const common = [
    21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 1433, 3306, 3389, 5432, 5900, 8080,
    8443, 9100,
  ];
  const protocol = random() < 0.7 ? 'TCP' : random() < 0.85 ? 'UDP' : 'ICMP';
  const port =
    random() < 0.8
      ? common[Math.floor(random() * common.length)]
      : 1 + Math.floor(random() * 65535);
  return {
    source: source.id,
    destination: addresses[Math.floor(random() * addresses.length)],
    protocol,
    port,
    checkReply: true,
  };
}
