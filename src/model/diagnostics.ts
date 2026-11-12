import { discoverDhcp, layer2Path } from './dhcp';
import {
  addressInPrefix,
  belongsToVlan,
  connectedNextHop,
  expandInterfaceClients,
  hostInterfaceAddressValid,
  primaryInterface,
} from './interfaces';
import { hasAcl, hostInVlan, isRoutingDevice, validIp } from './network';
import type { Network } from './networkTypes';
import { hardwareState, operationalNetwork, portFor, transferVlan } from './ports';

export type Diagnostic = {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  remedy: string;
  deviceId?: string;
  linkId?: string;
  vlanId?: number;
};
export function diagnoseNetwork(network: Network): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const add = (issue: Omit<Diagnostic, 'id'>) =>
    issues.push({
      ...issue,
      id: `${issue.code}:${issue.linkId || issue.deviceId || issue.vlanId || 'project'}:${issues.length}`,
    });
  const hw = hardwareState(network);
  const active = operationalNetwork(network);
  for (const d of network.devices) {
    if (d.accessSession && d.accessSession.state !== 'accepted')
      add({
        code: 'radius-access-denied',
        severity: 'error',
        title: `${d.name}: dostęp 802.1X odrzucony`,
        message: d.accessSession.reason,
        remedy:
          'Sprawdź konto i autoryzację, shared secret, klienta NAS, zasilanie oraz UDP/1812 i trasę odpowiedzi.',
        deviceId: d.id,
      });
    else if (d.accessSession?.accounting === 'unavailable')
      add({
        code: 'radius-accounting-unavailable',
        severity: 'warning',
        title: `${d.name}: accounting niedostępny`,
        message: 'Logowanie zostało zaakceptowane, ale RADIUS UDP/1813 nie odpowiedział.',
        remedy: 'Sprawdź usługę accounting, ACL i trasę odpowiedzi NAS–RADIUS.',
        deviceId: d.id,
      });
  }
  for (const l of network.links) {
    const state = hw.links.get(l.id)!;
    const pair = `${network.devices.find((d) => d.id === l.a)?.name || l.a} ↔ ${network.devices.find((d) => d.id === l.b)?.name || l.b}`;
    if (!state.up)
      add({
        code: 'link-down',
        severity: 'error',
        title: `Łącze nieaktywne: ${pair}`,
        message: [...new Set(state.errors)].join(' ') || 'Brak aktywnego urządzenia.',
        remedy:
          'Sprawdź przypisanie i zajętość portów, stan administracyjny, medium, moduły, długość i zgodne prędkości.',
        linkId: l.id,
      });
    for (const message of state.warnings)
      add({
        code: 'link-degraded',
        severity: 'warning',
        title: `Ograniczenie łącza: ${pair}`,
        message,
        remedy: 'Ustaw autonegocjację na obu końcach, sprawdź duplex i specyfikację kabla.',
        linkId: l.id,
      });
    const a = portFor(network, l, 'a'),
      b = portFor(network, l, 'b');
    if (!state.up || !a || !b) continue;
    const vlanCandidates = new Set([
      a.nativeVlan || 1,
      b.nativeVlan || 1,
      a.accessVlan || 1,
      b.accessVlan || 1,
    ]);
    const translated: string[] = [];
    for (const from of [l.a, l.b])
      for (const vlan of vlanCandidates) {
        const sent = transferVlan(active, l, from, vlan);
        if (!sent.error && sent.vlan !== vlan) translated.push(`${vlan} → ${sent.vlan}`);
      }
    if (translated.length)
      add({
        code: 'native-mismatch',
        severity: 'error',
        title: `Niezgodność VLAN ramki nietagowanej: ${pair}`,
        message: `Mapowanie ${[...new Set(translated)].join(', ')}. Ruch tagowany innych VLAN-ów może nadal działać; istnieje ryzyko połączenia niewłaściwych domen L2.`,
        remedy:
          'Uzgodnij access VLAN / native VLAN obu końców lub świadomie włącz tagowanie native.',
        linkId: l.id,
      });
    if (
      a.mode === 'trunk' &&
      b.mode === 'trunk' &&
      network.vlans.some(
        (v) =>
          !!transferVlan(active, l, l.a, v.id).error !== !!transferVlan(active, l, l.b, v.id).error,
      )
    )
      add({
        code: 'vlan-asymmetry',
        severity: 'warning',
        title: `Asymetryczne filtrowanie VLAN: ${pair}`,
        message: 'Porty nie przyjmują tych samych VLAN-ów w obu kierunkach.',
        remedy:
          'Porównaj allowed VLANs i tagowanie native na obu końcach. Zawężenie listy może być zamierzone.',
        linkId: l.id,
      });
  }
  for (const [deviceId, message] of hw.powerErrors)
    add({
      code: 'poe-denied',
      severity: 'error',
      title: 'Brak zasilania PoE',
      message,
      remedy:
        'Sprawdź standard PSE, pobór PD, kabel miedziany, budżet switcha i wybrane źródło zasilania.',
      deviceId,
    });
  for (const d of network.devices) {
    if (d.kind === 'rack') continue;
    for (const p of d.ports || []) {
      const ids =
        p.mode === 'access'
          ? [p.accessVlan || 1]
          : p.mode === 'trunk'
            ? [p.nativeVlan || 1, ...(p.allowedVlans || [])]
            : [];
      if (ids.some((id) => !network.vlans.some((v) => v.id === id)))
        add({
          code: 'port-vlan-undefined',
          severity: 'warning',
          title: `${d.name} / ${p.name}: VLAN bez konfiguracji sieci`,
          message: 'Co najmniej jeden VLAN portu nie jest opisany w katalogu sieci projektu.',
          remedy: 'Dodaj sieć lub popraw VLAN portu. Izolowany VLAN L2 może być zamierzony.',
          deviceId: d.id,
        });
    }
    if (hasAcl(d) && d.defaultAcl !== 'allow' && !d.rules.some((r) => r.action === 'allow'))
      add({
        code: 'acl-deny',
        severity: 'info',
        title: `${d.name}: brak reguł permit`,
        message:
          'Polityka deny blokuje niedopasowany ruch L3. Ruch przełączany wewnątrz VLAN-u nie wymaga ACL routingu.',
        remedy: 'Dodaj wymagane reguły; pozostaw deny, jeśli izolacja jest zamierzona.',
        deviceId: d.id,
      });
    if (d.routingMode === 'static')
      for (const route of d.routes || []) {
        const next = network.devices.find((n) => n.id === route.nextHopId);
        const hop = next && connectedNextHop(network, d, next);
        const direct = active.links.some(
          (l) => (l.a === d.id && l.b === next?.id) || (l.b === d.id && l.a === next?.id),
        );
        if (
          !next ||
          next.id === d.id ||
          !hw.powered.get(next.id) ||
          (!direct && (!hop || !layer2Path(active, d.id, next.id, hop.vlan, hop.portId)))
        )
          add({
            code: 'static-next-hop',
            severity: 'error',
            title: `${d.name}: nieosiągalny następny skok`,
            message: `Trasa ${route.destination} wskazuje ${next?.name || route.nextHopId}, ale nie ma aktywnego połączenia L2 do tego sąsiada.`,
            remedy:
              'Sprawdź adres interfejsu, VLAN tranzytowy, porty i zasilanie następnego routera. Nie wskazuj samego siebie.',
            deviceId: d.id,
          });
      }
    const nics =
      d.interfaces ||
      (!isRoutingDevice(d) && d.kind !== 'internet' && d.kind !== 'switch-unmanaged'
        ? [primaryInterface(d, network)]
        : []);
    for (const n of nics.filter((n) => n.enabled && n.ipMode === 'static')) {
      if (!hostInterfaceAddressValid(n))
        add({
          code: 'invalid-host-address',
          severity: 'error',
          title: `${d.name} / ${n.name}: błędny adres hosta`,
          message: `${n.ip}/${n.prefix} nie jest adresem hosta tego interfejsu.`,
          remedy: 'Popraw adres i maskę; nie używaj adresu sieci ani broadcastu dla /1–/30.',
          deviceId: d.id,
        });
      if (n.gateway && (!addressInPrefix(n.gateway, n.ip, n.prefix) || n.gateway === n.ip))
        add({
          code: 'gateway-offlink',
          severity: 'error',
          title: `${d.name} / ${n.name}: niepoprawna brama`,
          message: `Brama ${n.gateway} nie jest innym hostem w podsieci ${n.ip}/${n.prefix}.`,
          remedy: 'Ustaw bramę w podsieci właściwej karty albo usuń bramę dla sieci izolowanej.',
          deviceId: d.id,
        });
      const scope = network.vlans.find((v) => v.id === n.vlan);
      if (d.interfaces && scope && !hostInVlan(n.ip, scope))
        add({
          code: 'scope-address-mismatch',
          severity: 'warning',
          title: `${d.name} / ${n.name}: adres poza opisem VLAN`,
          message: `Interfejs ma ${n.ip}/${n.prefix}, a katalog VLAN ${n.vlan} opisuje ${scope.cidr}.`,
          remedy:
            'Sprawdź zamierzoną adresację i opis sieci. Host korzysta z własnej maski i bramy.',
          deviceId: d.id,
        });
    }
    if (d.interfaces && d.interfaces.filter((n) => n.enabled && n.gateway).length > 1)
      add({
        code: 'multiple-gateways',
        severity: 'warning',
        title: `${d.name}: wiele bram domyślnych`,
        message:
          'Wybór trasy zależy od prefiksu, metryki i dostępności interfejsów. Odpowiedź może wracać inną kartą.',
        remedy:
          'Sprawdź metryki i trasę odpowiedzi. Dodatkowa karta nie włącza routingu między sieciami.',
        deviceId: d.id,
      });
  }
  const addresses = new Map<string, Set<string>>();
  for (const d of network.devices) {
    if (d.kind === 'rack') continue;
    const ips = d.interfaces ? d.interfaces.filter((n) => n.enabled).map((n) => n.ip) : [d.ip];
    ips.push(
      d.wanIp || '',
      ...network.vlans.filter((v) => v.gatewayDeviceId === d.id).map((v) => v.gateway),
    );
    for (const ip of ips.filter(validIp)) {
      const owners = addresses.get(ip) || new Set<string>();
      owners.add(d.id);
      addresses.set(ip, owners);
    }
  }
  for (const [ip, owners] of addresses)
    if (owners.size > 1)
      add({
        code: 'ip-conflict',
        severity: 'error',
        title: `Konflikt IPv4 ${ip}`,
        message: [...owners].map((id) => network.devices.find((d) => d.id === id)!.name).join(', '),
        remedy: 'Przydziel unikalne adresy; porównaj też SVI i interfejsy dodatkowych kart.',
        deviceId: [...owners][0],
      });
  const expanded = expandInterfaceClients(network);
  const clients = operationalNetwork(expanded.network);
  for (const client of clients.devices.filter((d) => d.ipMode === 'auto' && d.online)) {
    const status = discoverDhcp(clients, client);
    if (status.state === 'bound' && client.ip) continue;
    const leaseValid = client.lease && client.lease.expiresAt > Date.now() && !!client.ip;
    add({
      code: 'dhcp-unavailable',
      severity: leaseValid ? 'warning' : 'error',
      title: `${client.name}: ${leaseValid ? 'serwer DHCP niedostępny, dzierżawa nadal ważna' : 'brak adresu DHCP'}`,
      message:
        status.state === 'bound'
          ? 'Serwer osiągalny, ale brak wolnego adresu w puli.'
          : status.message,
      remedy: 'Sprawdź serwer, pulę, porty VLAN, PoE oraz relay i UDP/67 w obu kierunkach.',
      deviceId: expanded.bindings.get(client.id)?.owner || client.id,
    });
  }
  for (const v of network.vlans) {
    const gateway = network.devices.find((d) => d.id === v.gatewayDeviceId);
    if (v.gatewayDeviceId && (!gateway || !isRoutingDevice(gateway)))
      add({
        code: 'invalid-gateway',
        severity: 'error',
        title: `${v.name}: nieprawidłowa brama L3`,
        message: 'Przypisane urządzenie nie istnieje albo nie realizuje routingu.',
        remedy: 'Wybierz router, firewall lub switch L3.',
        vlanId: v.id,
      });
    else if (
      gateway &&
      network.devices.some(
        (d) =>
          belongsToVlan(d, v.id) &&
          d.id !== gateway.id &&
          d.online &&
          !(d.interfaces?.length
            ? d.interfaces
                .filter((n) => n.vlan === v.id)
                .some((n) => n.enabled && layer2Path(active, d.id, gateway.id, v.id, n.portId))
            : layer2Path(active, d.id, gateway.id, v.id)),
      )
    )
      add({
        code: 'gateway-unreachable',
        severity: 'warning',
        title: `${v.name}: brama nieosiągalna z części urządzeń`,
        message: `Brama ${v.gateway} wymaga ciągłości domeny L2 do SVI.`,
        remedy: 'Sprawdź access/native VLAN, trunk, kable i porty na trasie do bramy.',
        vlanId: v.id,
        deviceId: gateway.id,
      });
  }
  return issues.sort(
    (a, b) =>
      ['error', 'warning', 'info'].indexOf(a.severity) -
      ['error', 'warning', 'info'].indexOf(b.severity),
  );
}
