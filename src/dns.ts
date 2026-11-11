import { validHostname, validIp } from './network';
import type { Network, Probe, Result } from './networkTypes';
export type DnsAnswer = {
  ok: boolean;
  name: string;
  address?: string;
  serverId?: string;
  query?: Result;
  reason: string;
};
export function resolveDns(
  network: Network,
  sourceId: string,
  input: string,
  query: (probe: Probe) => Result,
): DnsAnswer {
  const name = input.trim().toLowerCase().replace(/\.$/, '');
  if (!validHostname(name))
    return { ok: false, name, reason: 'Podaj poprawną nazwę DNS, np. npm.lab.home.arpa.' };
  const source = network.devices.find((d) => d.id === sourceId);
  const scope = network.vlans.find((v) => v.id === source?.vlan);
  const servers =
    source?.dnsServerIds ??
    (source?.ipMode === 'auto' && source.lease?.dnsServerIds !== undefined
      ? source.lease.dnsServerIds
      : scope?.dnsServerIds) ??
    [];
  if (!servers.length)
    return {
      ok: false,
      name,
      reason:
        'Klient nie ma resolvera DNS. Ustaw DNS w sieci/VLAN-ie i odnów DHCP albo wybierz DNS statycznie w urządzeniu.',
    };
  let last: DnsAnswer = {
    ok: false,
    name,
    reason: 'Żaden skonfigurowany serwer DNS nie odpowiedział.',
  };
  for (const serverId of servers) {
    const server = network.devices.find((d) => d.id === serverId);
    if (!server) {
      last = { ok: false, name, serverId, reason: 'Skonfigurowany resolver DNS został usunięty.' };
      continue;
    }
    const response = query({
      source: sourceId,
      destination: serverId,
      protocol: 'UDP',
      port: 53,
      checkReply: true,
    });
    if (!response.ok) {
      last = {
        ok: false,
        name,
        serverId,
        query: response,
        reason: `DNS ${server.name} nie odpowiada: ${response.reason}`,
      };
      continue;
    }
    const record = server.dnsRecords?.find((r) => r.name.toLowerCase().replace(/\.$/, '') === name);
    if (!record)
      return {
        ok: false,
        name,
        serverId,
        query: response,
        reason: `DNS ${server.name}: NXDOMAIN — brak rekordu A dla ${name}.`,
      };
    const address = record.deviceId
      ? network.devices.find((d) => d.id === record.deviceId)?.ip
      : record.address;
    if (!address || !validIp(address))
      return {
        ok: false,
        name,
        serverId,
        query: response,
        reason: `DNS ${server.name}: rekord ${name} wskazuje urządzenie bez adresu lub usunięty cel.`,
      };
    return {
      ok: true,
      name,
      address,
      serverId,
      query: response,
      reason: `DNS ${server.name}: ${name} → ${address}.`,
    };
  }
  return last;
}
