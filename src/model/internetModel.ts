import { hasWan, isPublicModelIp } from './network';
import type { Device, Link, Network } from './networkTypes';
export function defaultInternet(): Device {
  return {
    id: 'internet-default',
    kind: 'internet',
    name: 'Internet',
    ip: '203.0.113.1',
    ipMode: 'static',
    vlan: 0,
    x: 260,
    y: 100,
    online: true,
    rules: [],
  };
}
export function blankProject(): Network {
  return { name: 'Nowa sieć', devices: [defaultInternet()], links: [], vlans: [] };
}
export function internetConnection(network: Network) {
  const candidates = network.devices.filter((d) => d.kind === 'internet');
  const internet =
    candidates.find((d) => d.online && network.links.some((l) => l.a === d.id || l.b === d.id)) ||
    candidates.find((d) => d.online) ||
    candidates[0];
  if (!internet)
    return {
      internet: undefined,
      edge: undefined,
      error: 'Brak obiektu Internet. Dodaj go z biblioteki lub zresetuj projekt.',
    };
  if (!internet.online)
    return {
      internet,
      edge: undefined,
      error: 'Obiekt Internet jest wyłączony. Włącz go w konfiguracji.',
    };
  const wires = network.links.filter((l) => l.a === internet.id || l.b === internet.id);
  if (!wires.length)
    return {
      internet,
      edge: undefined,
      error: 'Internet jest odłączony. Połącz go z jednym routerem brzegowym lub firewallem.',
    };
  if (wires.length !== 1)
    return {
      internet,
      edge: undefined,
      error: 'Internet musi mieć dokładnie jedno połączenie z pierwszym urządzeniem sieci.',
    };
  const edge = network.devices.find(
    (d) => d.id === (wires[0].a === internet.id ? wires[0].b : wires[0].a),
  );
  if (!edge || !['router', 'firewall', 'gateway'].includes(edge.kind))
    return {
      internet,
      edge,
      error: 'Pierwszym urządzeniem za Internetem musi być router lub firewall.',
    };
  if (!hasWan(edge) || !edge.wanIp || !isPublicModelIp(edge.wanIp))
    return {
      internet,
      edge,
      error:
        'Urządzenie przy Internecie nie ma publicznego WAN. Włącz rolę brzegową i ustaw adres WAN.',
    };
  return { internet, edge, error: '' };
}
function freeWan(network: Network) {
  for (let last = 10; last < 255; last++) {
    const ip = `203.0.113.${last}`;
    if (!network.devices.some((d) => d.ip === ip || d.wanIp === ip)) return ip;
  }
  throw Error('Brak wolnego przykładowego adresu WAN 203.0.113.x.');
}
export function prepareInternet(network: Network): Network {
  let next = network.devices.some((d) => d.kind === 'internet')
    ? network
    : { ...network, devices: [defaultInternet(), ...network.devices] };
  const internet = next.devices.find((d) => d.kind === 'internet')!;
  const wires = next.links.filter((l) => l.a === internet.id || l.b === internet.id);
  if (wires.length === 1) {
    const neighbor = wires[0].a === internet.id ? wires[0].b : wires[0].a;
    const edge = next.devices.find((d) => d.id === neighbor);
    if (
      edge &&
      ['router', 'firewall', 'gateway'].includes(edge.kind) &&
      (!hasWan(edge) || !edge.wanIp || !isPublicModelIp(edge.wanIp))
    )
      next = {
        ...next,
        devices: next.devices.map((d) =>
          d.id === edge.id
            ? {
                ...d,
                edgeRole: 'edge',
                wanIp: edge.wanIp && isPublicModelIp(edge.wanIp) ? edge.wanIp : freeWan(next),
                outboundNat: d.outboundNat ?? true,
              }
            : d,
        ),
      };
  }
  return next;
}
export function connectInternet(network: Network, a: string, b: string, id: string): Network {
  const internet = network.devices.find((d) => d.kind === 'internet' && (d.id === a || d.id === b));
  if (!internet) throw Error('Wybierz Internet i urządzenie brzegowe.');
  const edge = network.devices.find((d) => d.id === (internet.id === a ? b : a));
  if (!edge || !['gateway', 'router', 'firewall'].includes(edge.kind))
    throw Error(
      'Internet połącz z routerem lub firewallem, a nie bezpośrednio z hostem lub switchem.',
    );
  if (network.links.some((l) => l.a === internet.id || l.b === internet.id))
    throw Error('Internet ma już urządzenie brzegowe. Najpierw usuń poprzednie połączenie.');
  const wire: Link = { id, a, b, mode: 'auto' };
  return prepareInternet({ ...network, links: [...network.links, wire] });
}
export function internetTargets(network: Network) {
  const state = internetConnection(network);
  if (state.error || !state.edge) return [];
  const edge = state.edge;
  return [
    ...new Set([
      edge.wanIp!,
      ...(edge.portForwards || []).filter((r) => r.enabled).map((r) => r.externalIp),
      ...(edge.staticNat || []).filter((r) => r.enabled).map((r) => r.publicIp),
    ]),
  ].filter(isPublicModelIp);
}
