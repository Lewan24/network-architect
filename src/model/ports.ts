import type { Cable, Device, Link, Network, Port } from './networkTypes';

// A derived, non-serializable snapshot caches physical state during one traversal.
// Raw project objects are never cached: editing/mutating a project always recalculates state.
const OPERATIONAL = Symbol('operational-hardware');
const PORT_INDEX = Symbol('operational-port-index');
type OperationalNetwork = Network & {
  [OPERATIONAL]?: HardwareState;
  [PORT_INDEX]?: Map<string, Port>;
};

export const cableNames: Record<Cable, string> = {
  cat5e: 'Skrętka Cat 5e',
  cat6: 'Skrętka Cat 6',
  cat6a: 'Skrętka Cat 6A',
  om3: 'Światłowód OM3 (MM)',
  om4: 'Światłowód OM4 (MM)',
  os2: 'Światłowód OS2 (SM)',
  dac: 'Pasywny DAC 10G',
  wireless: 'Połączenie Wi-Fi',
  virtual: 'Połączenie wirtualne',
};
export const opticProfiles = {
  '1g-sx': { name: '1000BASE-SX', speed: 1000, medium: 'mm', om3: 550, om4: 550, os2: 0 },
  '1g-lx': { name: '1000BASE-LX/LH', speed: 1000, medium: 'sm', om3: 0, om4: 0, os2: 10000 },
  '10g-sr': { name: '10GBASE-SR', speed: 10000, medium: 'mm', om3: 300, om4: 400, os2: 0 },
  '10g-lr': { name: '10GBASE-LR', speed: 10000, medium: 'sm', om3: 0, om4: 0, os2: 10000 },
} as const;
export const poeStandards = { off: 0, af: 15.4, at: 30, bt3: 60, bt4: 90 } as const;
/** PSE allocation / guaranteed power at PD, including the standard channel loss budget. */
export const poeClasses = [
  { pse: 4, pd: 3.84 },
  { pse: 7, pd: 6.49 },
  { pse: 15.4, pd: 12.95 },
  { pse: 30, pd: 25.5 },
  { pse: 45, pd: 40 },
  { pse: 60, pd: 51 },
  { pse: 75, pd: 62 },
  { pse: 90, pd: 71.3 },
] as const;
const switching = (d: Device) => ['switch', 'switch-l3', 'switch-unmanaged'].includes(d.kind);

export function makePort(id: string, connector: Port['connector'] = 'rj45', vlan = 1): Port {
  return {
    id,
    name: id,
    connector,
    enabled: true,
    speeds:
      connector === 'rj45'
        ? [10, 100, 1000]
        : connector === 'sfp'
          ? [1000]
          : connector === 'sfp+'
            ? [1000, 10000]
            : [1000],
    mode: 'access',
    accessVlan: vlan || 1,
    duplex: 'auto',
    poe: 'off',
  };
}
export function defaultPorts(d: Device): Port[] {
  if (d.kind === 'vm') return [{ ...makePort('vnic0', 'virtual', d.vlan), mode: 'auto' }];
  if (d.kind === 'mobile-phone') return [{ ...makePort('wlan0', 'wifi', d.vlan), mode: 'auto' }];
  if (d.kind === 'accesspoint')
    return [
      { ...makePort('eth0', 'rj45', d.vlan), mode: 'trunk', nativeVlan: d.vlan || 1 },
      makePort('radio0', 'wifi', d.wifiVlan ?? d.vlan),
    ];
  const count = switching(d)
    ? 24
    : ['router', 'gateway', 'firewall'].includes(d.kind)
      ? 6
      : d.kind === 'server'
        ? 4
        : 1;
  const ports = Array.from({ length: count }, (_, i) => ({
    ...makePort(`eth${i}`, 'rj45', d.vlan),
    ...(d.vlan === 0 || !switching(d) ? { mode: 'auto' as const } : {}),
  }));
  if (switching(d) || d.kind === 'server')
    ports.push(...[0, 1].map((i) => makePort(`sfp${i}`, 'sfp+', d.vlan)));
  if (d.kind === 'workstation') ports.push({ ...makePort('wlan0', 'wifi', d.vlan), mode: 'auto' });
  return ports;
}
export const isSharedPort = (p: Port, device?: Device) =>
  p.connector === 'wifi' && device?.kind === 'accesspoint';
export function portFor(network: Network, link: Link, side: 'a' | 'b'): Port | undefined {
  const index = (network as OperationalNetwork)[PORT_INDEX];
  if (index) return index.get(`${link[side]}:${link[`${side}PortId`]}`);
  return network.devices
    .find((d) => d.id === link[side])
    ?.ports?.find((p) => p.id === link[`${side}PortId`]);
}
export function inferCable(a?: Port, b?: Port): Cable {
  if (a?.connector === 'virtual' || b?.connector === 'virtual') return 'virtual';
  if (a?.connector === 'wifi' && b?.connector === 'wifi') return 'wireless';
  if (
    a?.connector === 'sfp' ||
    a?.connector === 'sfp+' ||
    b?.connector === 'sfp' ||
    b?.connector === 'sfp+'
  )
    return 'om3';
  return 'cat6';
}
/** Materializes ports only on user-facing projects. Pure legacy fixtures retain their logical behavior. */
export function prepareHardware(network: Network): Network {
  const devices = network.devices.map((d) => ({
    ...d,
    ports: d.ports
      ? d.ports.map((p) => ({ ...p }))
      : defaultPorts(d).map((p) => ({ ...p, mode: 'auto' as const })),
  }));
  const next = { ...network, devices, links: network.links.map((l) => ({ ...l })) };
  const used = new Set<string>();
  for (const l of next.links)
    for (const side of ['a', 'b'] as const) {
      const p = portFor(next, l, side);
      if (
        p &&
        !isSharedPort(
          p,
          devices.find((d) => d.id === l[side]),
        )
      )
        used.add(`${l[side]}:${p.id}`);
    }
  for (const l of next.links) {
    if (l.id.startsWith('virtual:')) continue;
    for (const side of ['a', 'b'] as const) {
      if (l[`${side}PortId`]) continue;
      const d = devices.find((d) => d.id === l[side]);
      const peer = devices.find((d) => d.id === l[side === 'a' ? 'b' : 'a']);
      if (!d || !peer) continue;
      if (d.kind === 'vm' || peer.kind === 'vm') continue;
      const wireless =
        (d.kind === 'accesspoint' && ['mobile-phone', 'workstation'].includes(peer.kind)) ||
        (peer.kind === 'accesspoint' && ['mobile-phone', 'workstation'].includes(d.kind));
      const p = d.ports.find(
        (p) =>
          (wireless ? p.connector === 'wifi' : p.connector === 'rj45') &&
          (isSharedPort(p, d) || !used.has(`${d.id}:${p.id}`)),
      );
      if (p) {
        l[`${side}PortId`] = p.id;
        if (!isSharedPort(p, d)) used.add(`${d.id}:${p.id}`);
      }
    }
    l.cable ??= inferCable(portFor(next, l, 'a'), portFor(next, l, 'b'));
    if (!['virtual', 'wireless'].includes(l.cable)) l.lengthMeters ??= 3;
  }
  return next;
}
export type LinkState = {
  up: boolean;
  speedMbps: number;
  errors: string[];
  warnings: string[];
  aPort?: Port;
  bPort?: Port;
};
export function physicalLinkState(network: Network, link: Link): LinkState {
  const cached = (network as OperationalNetwork)[OPERATIONAL]?.links.get(link.id);
  if (cached) return cached;
  const aPort = portFor(network, link, 'a'),
    bPort = portFor(network, link, 'b');
  const state: LinkState = { up: true, speedMbps: 1000, errors: [], warnings: [], aPort, bPort };
  const error = (text: string) => {
    state.errors.push(text);
    state.up = false;
  };
  const a = network.devices.find((d) => d.id === link.a),
    b = network.devices.find((d) => d.id === link.b);
  if (!a || !b) {
    error('Nieistniejące urządzenie na końcu łącza.');
    return state;
  }
  if (!a.online || !b.online) error('Urządzenie na końcu łącza jest wyłączone.');
  if (link.id.startsWith('virtual:')) {
    const vm = a.kind === 'vm' ? a : b;
    const p = vm.ports?.find((p) => p.connector === 'virtual');
    if (vm.ports && !p?.enabled)
      error(`${vm.name}: wirtualna karta sieciowa jest wyłączona lub nie istnieje.`);
    state.speedMbps = p?.speedMbps || Math.max(...(p?.speeds || [10000]));
    return state;
  }
  for (const [d, p, id] of [
    [a, aPort, link.aPortId],
    [b, bPort, link.bPortId],
  ] as const) {
    if (d.ports && !p)
      error(`${d.name}: ${id ? 'port nie istnieje' : 'nie przypisano wolnego portu'}.`);
    if (!p) continue;
    if (!p.enabled) error(`${d.name} / ${p.name}: port administracyjnie wyłączony.`);
    if (
      !isSharedPort(p, d) &&
      network.links.filter(
        (l) => (l.a === d.id && l.aPortId === p.id) || (l.b === d.id && l.bPortId === p.id),
      ).length > 1
    )
      error(`${d.name} / ${p.name}: port zajęty przez więcej niż jeden kabel.`);
  }
  // A legacy link without hardware fields is intentionally a logical, unconstrained link.
  if (!aPort || !bPort) return state;
  const cable = link.cable || inferCable(aPort, bPort);
  const length = link.lengthMeters ?? 3;
  const connectors = [aPort.connector, bPort.connector];
  let mediaSpeeds: number[] = [];
  if (['cat5e', 'cat6', 'cat6a'].includes(cable)) {
    if (connectors.some((c) => c !== 'rj45'))
      error('Kabel miedziany wymaga portów RJ45 na obu końcach.');
    if (length > 100) error('Kanał skrętki przekracza 100 m.');
    mediaSpeeds =
      cable === 'cat5e'
        ? [10, 100, 1000, 2500, 5000]
        : cable === 'cat6' && length > 55
          ? [10, 100, 1000, 2500, 5000]
          : [10, 100, 1000, 2500, 5000, 10000];
  } else if (cable === 'dac') {
    if (connectors.some((c) => c !== 'sfp+'))
      error('Profil pasywnego DAC 10G wymaga dwóch gniazd SFP+.');
    if (length > 7) error('Przekroczono zasięg profilu pasywnego DAC (7 m).');
    mediaSpeeds = [10000];
  } else if (cable === 'wireless' || cable === 'virtual') {
    const required = cable === 'wireless' ? 'wifi' : 'virtual';
    if (connectors.some((c) => c !== required))
      error(`Medium ${cableNames[cable]} nie odpowiada portom.`);
    if (cable === 'wireless' && a.kind !== 'accesspoint' && b.kind !== 'accesspoint')
      error('Klient Wi-Fi wymaga punktu dostępowego.');
    mediaSpeeds = [10, 100, 1000, 10000];
  } else {
    if (connectors.some((c) => c !== 'sfp' && c !== 'sfp+'))
      error('Światłowód wymaga portów SFP/SFP+.');
    if (!aPort.module || !bPort.module) error('Brak modułu optycznego na jednym z końców.');
    else {
      if (aPort.module !== bPort.module) error('Niezgodne standardy modułów optycznych.');
      for (const p of [aPort, bPort]) {
        const profile = opticProfiles[p.module!];
        const reach = profile[cable as 'om3' | 'om4' | 'os2'];
        if (!reach) error(`${profile.name}: niezgodny typ włókna ${cable.toUpperCase()}.`);
        else if (length > reach)
          error(`${profile.name}: przekroczony zasięg ${reach} m dla ${cable.toUpperCase()}.`);
        if (profile.speed === 10000 && p.connector !== 'sfp+')
          error('Moduł 10G wymaga gniazda SFP+.');
      }
      mediaSpeeds = [opticProfiles[aPort.module].speed];
    }
  }
  const supported = (p: Port) =>
    p.speedMbps ? p.speeds.filter((s) => s === p.speedMbps) : p.speeds;
  const common = supported(aPort).filter(
    (s) => supported(bPort).includes(s) && mediaSpeeds.includes(s),
  );
  if (!common.length) error('Brak wspólnej prędkości portów, modułów i kabla.');
  state.speedMbps = common.length ? Math.max(...common) : 0;
  if (state.speedMbps === 10000 && cable === 'cat6' && length > 37)
    state.warnings.push('10G na Cat 6 zależy od warunków przesłuchu; wymagany pomiar toru.');
  if (state.speedMbps === 5000 && cable === 'cat5e')
    state.warnings.push('5G na Cat 5e wymaga kwalifikacji toru i sprawdzenia przesłuchów.');
  if (state.speedMbps > 100 && [aPort, bPort].some((p) => p.duplex === 'half'))
    error('Profil portu gigabitowego lub szybszego wymaga full duplex.');
  if (state.speedMbps <= 100) {
    const duplex = (p: Port, peer: Port) =>
      p.duplex && p.duplex !== 'auto' ? p.duplex : peer.speedMbps && !p.speedMbps ? 'half' : 'full';
    if (duplex(aPort, bPort) !== duplex(bPort, aPort))
      state.warnings.push('Duplex mismatch: możliwe kolizje, błędy i spadek przepustowości.');
  }
  return state;
}

/** A VLAN's wire encoding is determined independently on each end. */
export function transferVlan(
  network: Network,
  link: Link,
  from: string,
  vlan: number,
): { vlan: number; error?: string } {
  const fromSide = link.a === from ? 'a' : 'b';
  const toSide = fromSide === 'a' ? 'b' : 'a';
  const physical = physicalLinkState(network, link);
  if (!physical.up) return { vlan, error: physical.errors.join(' ') };
  const source = portFor(network, link, fromSide),
    target = portFor(network, link, toSide);
  if ((!source || source.mode === 'auto') && (!target || target.mode === 'auto')) {
    const allowed =
      !vlan ||
      (link.mode === 'access'
        ? vlan === (link.accessVlan || 1)
        : link.mode !== 'trunk' || !link.allowedVlans?.length || link.allowedVlans.includes(vlan));
    return allowed ? { vlan } : { vlan, error: `Port access/trunk nie przenosi VLAN ${vlan}.` };
  }
  // Compatibility mode inherits the old link-wide logical configuration.
  const mode = (p?: Port) => (p?.mode !== 'auto' && p ? p.mode : link.mode || 'auto');
  const allows = (p?: Port) =>
    mode(p) === 'auto' ||
    (mode(p) === 'access'
      ? vlan === (p?.mode === 'access' ? p.accessVlan || 1 : link.accessVlan || 1)
      : !(p?.mode === 'trunk' ? p.allowedVlans : link.allowedVlans)?.length ||
        (p?.mode === 'trunk' ? p.allowedVlans : link.allowedVlans)!.includes(vlan));
  if (!vlan) return { vlan }; // Routed/WAN transit is checked by IP interfaces, not a fabricated VLAN tag.
  if (!allows(source)) return { vlan, error: `Port nadawczy nie przenosi VLAN ${vlan}.` };
  if (mode(source) === 'auto' || mode(target) === 'auto')
    return allows(target) ? { vlan } : { vlan, error: `Port odbiorczy nie przenosi VLAN ${vlan}.` };
  const native = (p?: Port) =>
    mode(p) === 'access'
      ? p?.mode === 'access'
        ? p.accessVlan || 1
        : link.accessVlan || 1
      : p?.nativeVlan || 1;
  const tagged = mode(source) === 'trunk' && (vlan !== native(source) || source?.tagNative);
  if (tagged) {
    if (mode(target) !== 'trunk')
      return { vlan, error: `Ramka tagowana VLAN ${vlan} trafia na port access.` };
    return allows(target)
      ? { vlan }
      : { vlan, error: `VLAN ${vlan} jest odfiltrowany na trunku odbiorczym.` };
  }
  const receivedVlan = native(target);
  const list = target?.mode === 'trunk' ? target.allowedVlans : link.allowedVlans;
  if (mode(target) === 'trunk' && list?.length && !list.includes(receivedVlan))
    return {
      vlan: receivedVlan,
      error: `Native VLAN ${receivedVlan} jest odfiltrowany na trunku.`,
    };
  return { vlan: receivedVlan };
}

export type HardwareState = {
  links: Map<string, LinkState>;
  powered: Map<string, boolean>;
  poe: Map<string, { budget: number; allocated: number; consumers: string[] }>;
  powerErrors: Map<string, string>;
};
export function hardwareState(network: Network): HardwareState {
  const cached = (network as OperationalNetwork)[OPERATIONAL];
  if (cached) return cached;
  const links = new Map(network.links.map((l) => [l.id, physicalLinkState(network, l)]));
  const powered = new Map(network.devices.map((d) => [d.id, d.online && d.powerSource !== 'poe']));
  const poe = new Map(
    network.devices.map((d) => [
      d.id,
      { budget: d.poeBudgetWatts || 0, allocated: 0, consumers: [] as string[] },
    ]),
  );
  const powerErrors = new Map<string, string>();
  // Stable consumer IDs define reservation order, independent of list/repaint order.
  for (const consumer of network.devices
    .filter((d) => d.online && d.powerSource === 'poe')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const demand = consumer.powerWatts || 0;
    const cls = poeClasses.find((c) => c.pd >= demand);
    let reason = cls
      ? 'Brak aktywnego portu PSE dostarczającego PoE.'
      : 'Zapotrzebowanie przekracza 71,3 W dostępne w profilu 802.3bt Type 4.';
    if (!demand) {
      powerErrors.set(consumer.id, 'Podaj dodatni pobór mocy urządzenia PoE.');
      continue;
    }
    const candidates = network.links
      .filter((l) => l.a === consumer.id || l.b === consumer.id)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const l of candidates) {
      const side = l.a === consumer.id ? 'b' : 'a';
      const supplier = network.devices.find((d) => d.id === l[side]);
      const p = portFor(network, l, side);
      const own = portFor(network, l, side === 'a' ? 'b' : 'a');
      const allocation = supplier && poe.get(supplier.id);
      if (
        !cls ||
        !supplier?.online ||
        supplier.powerSource === 'poe' ||
        !p?.enabled ||
        p.connector !== 'rj45' ||
        own?.connector !== 'rj45' ||
        !['cat5e', 'cat6', 'cat6a'].includes(l.cable || 'cat6') ||
        (l.lengthMeters || 0) > 100
      )
        continue;
      if (
        network.links.filter(
          (wire) =>
            (wire.a === supplier.id && wire.aPortId === p.id) ||
            (wire.b === supplier.id && wire.bPortId === p.id),
        ).length !== 1
      )
        continue;
      if (poeStandards[p.poe || 'off'] < cls.pse) {
        reason = `${supplier.name} / ${p.name}: za niski standard PoE (wymagana alokacja ${cls.pse} W).`;
        continue;
      }
      if (!allocation || allocation.allocated + cls.pse > allocation.budget) {
        reason = `${supplier.name}: przekroczony budżet PoE (potrzebne ${cls.pse} W PSE, pozostało ${Math.max(0, (allocation?.budget || 0) - (allocation?.allocated || 0)).toFixed(1)} W).`;
        continue;
      }
      allocation.allocated += cls.pse;
      allocation.consumers.push(consumer.id);
      powered.set(consumer.id, true);
      reason = '';
      break;
    }
    if (reason) powerErrors.set(consumer.id, reason);
  }
  for (const l of network.links)
    if (!powered.get(l.a) || !powered.get(l.b)) {
      const s = links.get(l.id)!;
      s.up = false;
      const error = powerErrors.get(l.a) || powerErrors.get(l.b);
      if (error) s.errors.push(error);
    }
  return { links, powered, poe, powerErrors };
}
export function operationalNetwork(network: Network): Network {
  if ((network as OperationalNetwork)[OPERATIONAL]) return network;
  if (
    !network.devices.some((d) => d.ports || d.powerSource === 'poe') &&
    !network.links.some((l) => l.cable || l.aPortId || l.bPortId)
  )
    return network;
  const hw = hardwareState(network);
  const active = {
    ...network,
    devices: network.devices.map((d) => ({ ...d, online: !!hw.powered.get(d.id) })),
    links: network.links.filter((l) => hw.links.get(l.id)?.up),
  };
  Object.defineProperty(active, OPERATIONAL, { value: hw, enumerable: false });
  Object.defineProperty(active, PORT_INDEX, {
    value: new Map(
      active.devices.flatMap((d) => (d.ports || []).map((p) => [`${d.id}:${p.id}`, p] as const)),
    ),
    enumerable: false,
  });
  return active;
}
export function materializeHardware(network: Network): Network {
  return network.devices.some((d) => d.ports) ||
    network.links.some((l) => l.aPortId || l.bPortId || l.cable)
    ? prepareHardware(network)
    : network;
}
