import {
  activeInterface,
  connectedNextHop,
  addressInPrefix,
  routedInterface,
  hostInterfaceAddressValid,
  projectHostInterfaces,
} from '../model/interfaces';
import { hardwareState, operationalNetwork, physicalLinkState, transferVlan } from '../model/ports';
import { defaultServices } from '../devices/deviceCatalog';
import { layer2Path, reconcileDhcp, vlanInterface } from '../model/dhcp';
import { resolveDns } from '../model/dns';
import {
  hasAcl,
  hostInVlan,
  bridgesVlan,
  hasWan,
  ipNumber,
  isHypervisor,
  isPublicModelIp,
  isRoutingDevice,
  matchesAclAddress,
  publicAddresses,
  routeSubnet,
  topologyLinks,
  tracePath,
  traceLinkPath,
  validHostname,
  validIp,
} from '../model/network';
import type { Device, Network, Probe, Result, StaticRoute } from '../model/networkTypes';
type EngineOptions = {
  controlPlane?: boolean;
  reply?: boolean;
  sourceAddress?: string;
  stateful?: Set<string>;
  sourceNat?: {
    ownerId: string;
    ip: string;
  };
  destinationNat?: {
    ownerId: string;
    publicIp: string;
    privateIp: string;
  };
};
export function selectRoute(device: Device, destinationIp: string): StaticRoute | undefined {
  const ip = ipNumber(destinationIp);
  return (device.routes || [])
    .filter((r) => {
      const p = routeSubnet(r.destination);
      return ip >= p.start && ip <= p.end;
    })
    .slice()
    .sort(
      (a, b) =>
        routeSubnet(b.destination).prefix - routeSubnet(a.destination).prefix ||
        a.metric - b.metric,
    )[0];
}
type Plan = {
  path: string[];
  error?: string;
};
function simulatePacket(network: Network, probe: Probe, options: EngineOptions = {}): Result {
  network = operationalNetwork(network);
  const byId = new Map(network.devices.map((d) => [d.id, d]));
  const links = topologyLinks(network);
  const source = byId.get(probe.source);
  const traversedLinks: string[] = [];
  const fail = (reason: string, path: string[] = [], steps: string[] = []): Result => ({
    ok: false,
    path,
    reason,
    steps: steps.length ? steps : [reason],
    linkPath: [...traversedLinks],
  });
  if (source?.kind === 'rack' || byId.get(probe.destination)?.kind === 'rack')
    return fail('Szafa RACK nie jest uczestnikiem komunikacji sieciowej.');
  if (!source) return fail('Wybierz źródło komunikacji.');
  if (source.kind === 'switch-unmanaged')
    return fail('Switch niezarządzalny nie ma interfejsu IP i nie może być źródłem testu.');
  if (
    probe.protocol !== 'ICMP' &&
    (!Number.isInteger(probe.port) || probe.port < 1 || probe.port > 65535)
  )
    return fail('Port musi być liczbą od 1 do 65535.');
  if (
    !byId.has(probe.destination) &&
    !validIp(probe.destination) &&
    validHostname(probe.destination)
  ) {
    if (!source.online || !source.ip)
      return fail('Źródło jest wyłączone lub czeka na DHCP; nie może wysłać zapytania DNS.');
    const answer = resolveDns(network, source.id, probe.destination, (q) =>
      simulateNetwork(network, { ...q, sourceInterfaceId: probe.sourceInterfaceId }),
    );
    if (!answer.ok) {
      const result = answer.query || fail(answer.reason);
      return {
        ...result,
        ok: false,
        verdict: 'unreachable',
        reason: answer.reason,
        dns: {
          name: answer.name,
          serverId: answer.serverId,
          ok: false,
          queryPath: [],
          querySteps: answer.query?.steps || [],
        },
      };
    }
    const result = simulateNetwork(network, { ...probe, destination: answer.address! }, options);
    const query = answer.query!;
    const queryPath = tracePath(query);
    const deduplicate = queryPath.at(-1) === result.path[0];
    const dataSteps = result.path.length
      ? deduplicate
        ? result.steps.slice(1)
        : result.steps
      : [];
    const steps = [...query.steps.map((s) => `DNS: ${s}`), ...dataSteps];
    if (!result.path.length && steps.length) steps[steps.length - 1] += ` ${result.reason}`;
    return {
      ...result,
      steps,
      dns: {
        name: answer.name,
        address: answer.address,
        serverId: answer.serverId,
        ok: true,
        queryPath,
        queryLinkPath: traceLinkPath(query),
        querySteps: query.steps,
      },
    };
  }
  let selected = byId.get(probe.destination);
  if (selected?.kind === 'switch-unmanaged')
    return fail('Switch niezarządzalny przekazuje ramki, ale nie odpowiada na testy IP.');
  const outside = source.kind === 'internet';
  if (outside && !isPublicModelIp(source.ip))
    return fail(
      'Internet wymaga publicznego adresu nadawcy; publiczny WAN ustaw osobno na brzegu sieci.',
    );
  function externalFailure(reason: string): Result {
    const queue: string[][] = [[source!.id]];
    const seen = new Set([source!.id]);
    let path = [source!.id];
    while (queue.length) {
      const p = queue.shift()!;
      const d = byId.get(p.at(-1)!)!;
      if (!d.online) continue;
      if (d.id !== source!.id && isRoutingDevice(d)) {
        path = p;
        break;
      }
      for (const l of links) {
        const next = l.a === d.id ? l.b : l.b === d.id ? l.a : null;
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push([...p, next]);
        }
      }
    }
    return fail(
      reason,
      path,
      path.map(
        (id, i) =>
          `${byId.get(id)!.name}: ${i === path.length - 1 ? reason : 'Pakiet zewnętrzny do brzegu sieci.'}`,
      ),
    );
  }
  let requestedIp = selected?.ip || probe.destination;
  if (outside && !options.reply) {
    if (selected && hasWan(selected) && selected.wanIp) {
      requestedIp = selected.wanIp;
      selected = undefined;
    }
    if (!publicAddresses(network).includes(requestedIp))
      return externalFailure(
        'Internet nie adresuje prywatnych urządzeń. Cel musi być publicznym adresem WAN brzegu lub opublikowanym adresem NAT.',
      );
  }
  const ownerOfAddress = (ip: string) =>
    network.devices.find(
      (d) =>
        d.ip === ip ||
        d.interfaces?.some((n) => n.enabled && n.ip === ip) ||
        network.vlans.some((v) => v.gateway === ip && v.gatewayDeviceId === d.id),
    );
  let target = selected || ownerOfAddress(requestedIp);
  if (selected?.ipMode === 'auto' && !selected.ip)
    return fail('Cel czeka na dzierżawę DHCP. Sprawdź serwer, pulę i połączenia.');
  if (options.destinationNat) requestedIp = options.destinationNat.publicIp;
  if (!validIp(requestedIp)) return fail('Wybierz cel lub podaj poprawny docelowy IPv4.');
  if (!source.online) return fail('Źródło jest wyłączone.');
  if (!source.ip)
    return fail('Źródło nie ma dzierżawy DHCP. Sprawdź pulę, serwer i połączenie L2 lub relay.');
  let targetIp = requestedIp;
  let targetPort = probe.port;
  let translation:
    | {
        owner: Device;
        ip: string;
        port: number;
        label: string;
      }
    | undefined;
  if (options.destinationNat) {
    const owner = byId.get(options.destinationNat.ownerId);
    if (owner) {
      translation = {
        owner,
        ip: options.destinationNat.privateIp,
        port: probe.port,
        label: 'Stateful reverse NAT',
      };
      targetIp = translation.ip;
    }
  }
  if (!selected && !translation) {
    for (const owner of network.devices.filter(hasWan)) {
      const pf = owner.portForwards?.find(
        (r) =>
          r.enabled &&
          r.externalIp === requestedIp &&
          r.protocol === probe.protocol &&
          r.externalPort === probe.port,
      );
      const nat = owner.staticNat?.find((r) => r.enabled && r.publicIp === requestedIp);
      if (pf || nat) {
        targetIp = pf?.internalIp || nat!.privateIp;
        targetPort = pf?.internalPort || probe.port;
        translation = {
          owner,
          ip: targetIp,
          port: targetPort,
          label: pf ? 'Port forwarding / DNAT' : 'Static NAT / DNAT',
        };
        target = ownerOfAddress(targetIp);
        break;
      }
    }
  }
  const publicOwner =
    !selected && !translation
      ? network.devices.find((d) => hasWan(d) && d.wanIp === requestedIp)
      : undefined;
  if (publicOwner) target = publicOwner;
  if (!target && !translation && source.kind !== 'internet' && isPublicModelIp(requestedIp))
    target = network.devices.find((d) => d.kind === 'internet');
  if (!target && !translation)
    return fail(
      `Adres ${requestedIp} nie wskazuje urządzenia, interfejsu SVI ani aktywnej publikacji NAT.`,
    );
  if (target?.id === source.id) return fail('Źródło i cel muszą być różne.');
  if (!source.online || (target && !target.online))
    return fail('Urządzenie źródłowe lub docelowe jest wyłączone.');
  const ownsAddress = (d: Device, ip: string) =>
    d.online &&
    (d.ip === ip ||
      d.wanIp === ip ||
      !!d.interfaces?.some((n) => n.enabled && n.ip === ip) ||
      network.vlans.some((v) => v.gatewayDeviceId === d.id && v.gateway === ip));
  for (const ip of [options.sourceAddress || source.ip, targetIp]) {
    if (network.devices.filter((d) => ownsAddress(d, ip)).length > 1)
      return fail(
        `Konflikt adresu IPv4 ${ip}: więcej niż jedno aktywne urządzenie używa tego adresu.`,
      );
  }
  for (const d of [source, target]) {
    if (!d || isRoutingDevice(d) || d.kind === 'internet') continue;
    const scope = network.vlans.find((v) => v.id === d.vlan);
    if (
      activeInterface(d)
        ? !hostInterfaceAddressValid(activeInterface(d)!)
        : !scope || !hostInVlan(d.ip, scope)
    )
      return fail(`${d.name}: adres IP nie należy do skonfigurowanej podsieci VLAN ${d.vlan}.`);
  }
  // A router can own several IP interfaces; its management VLAN is not the target VLAN of every SVI.
  const targetVlan =
    network.vlans.find((v) => v.gateway === targetIp && v.gatewayDeviceId === target?.id)?.id ??
    target?.interfaces?.find((n) => n.enabled && n.ip === targetIp)?.vlan ??
    target?.vlan;
  function findPath(from: string, to: string, destinationIp: string): Plan {
    const queue: string[][] = [[from]];
    const visited = new Set([from]);
    let blocked: Plan | undefined;
    while (queue.length) {
      const path = queue.shift()!;
      const id = path.at(-1)!;
      const d = byId.get(id)!;
      if (id === to) return { path };
      if (
        id !== from &&
        [
          'iot',
          'laptop',
          'nvr',
          'mini-server',
          'ups',
          'server',
          'dns',
          'radius',
          'camera',
          'workstation',
          'mobile-phone',
          'vm',
          'printer',
          'internet',
        ].includes(d.kind) &&
        !isHypervisor(d)
      )
        continue;
      let next = links.flatMap((l) => (l.a === id ? [l.b] : l.b === id ? [l.a] : []));
      if (isHypervisor(d) && id !== from) {
        const prev = byId.get(path.at(-2)!);
        if (prev?.kind !== 'vm' || prev.hostId !== d.id)
          next = next.filter((id) => byId.get(id)?.kind === 'vm' && byId.get(id)?.hostId === d.id);
      }
      if (isRoutingDevice(d)) {
        const nic = routedInterface(d, destinationIp);
        const connected = nic
          ? { id: nic.vlan, cidr: `${nic.ip}/${nic.prefix}` }
          : network.vlans.find(
              (v) =>
                (v.gatewayDeviceId === d.id || (v.id === d.vlan && hostInVlan(d.ip, v))) &&
                (() => {
                  const p = routeSubnet(v.cidr);
                  const ip = ipNumber(destinationIp);
                  return ip >= p.start && ip <= p.end;
                })(),
            );
        if (connected) {
          const local = layer2Path(network, d.id, to, connected.id, nic?.portId);
          if (local) return { path: [...path, ...local.slice(1)] };
          blocked = {
            path,
            error: `ARP/L2: cel w podłączonej sieci VLAN ${connected.id} (${connected.cidr}) jest nieosiągalny.`,
          };
          continue;
        }
        if (d.routingMode !== 'static') {
          for (const nextId of next)
            if (!visited.has(nextId) && byId.get(nextId)?.online) {
              visited.add(nextId);
              queue.push([...path, nextId]);
            }
          continue;
        }
        const route = selectRoute(d, destinationIp);
        if (!route) {
          blocked = { path, error: `${d.name}: brak trasy do ${destinationIp}.` };
          continue;
        }
        const nextDevice = byId.get(route.nextHopId);
        const hop = nextDevice && connectedNextHop(network, d, nextDevice);
        if (hop && nextDevice?.online) {
          if (visited.has(nextDevice.id)) {
            blocked = { path, error: `${d.name}: pętla routingu do ${destinationIp}.` };
            continue;
          }
          const local = layer2Path(network, d.id, nextDevice.id, hop.vlan, hop.portId);
          if (!local) {
            blocked = { path, error: `${d.name}: następny skok ${hop.ip} jest nieosiągalny w L2.` };
            continue;
          }
          visited.add(nextDevice.id);
          queue.push([...path, ...local.slice(1)]);
          continue;
        }
        if (!next.includes(route.nextHopId) || !nextDevice?.online) {
          blocked = { path, error: `${d.name}: następny skok trasy jest odłączony lub wyłączony.` };
          continue;
        }
        next = [route.nextHopId];
        if (visited.has(route.nextHopId))
          blocked = { path, error: `${d.name}: pętla routingu do ${destinationIp}.` };
      }
      for (const id of next)
        if (!visited.has(id) && byId.get(id)?.online) {
          visited.add(id);
          queue.push([...path, id]);
        }
    }
    return (
      blocked || {
        path: [],
        error: 'Brak dostępnej ścieżki. Sprawdź połączenia, hosta VM i stan urządzeń.',
      }
    );
  }
  function sourcePath(to: string, destinationIp: string): Plan {
    const nic = activeInterface(source!);
    const scope =
      network.vlans.find((v) => v.id === source!.vlan) ||
      (nic
        ? {
            id: nic.vlan,
            name: nic.name,
            cidr: `${nic.ip}/${nic.prefix}`,
            gateway: nic.gateway,
            gatewayDeviceId: undefined,
          }
        : undefined);
    const normal = !isRoutingDevice(source!) && source!.kind !== 'internet';
    if (normal && !scope)
      return {
        path: [source!.id],
        error:
          'Przypisz urządzenie do sieci LAN z maską i bramą. Bez interfejsu podsieci nie można ustalić trasy.',
      };
    const onLink = nic
      ? addressInPrefix(targetIp, nic.ip, nic.prefix)
      : targetVlan === source!.vlan;
    if (normal && scope && onLink) {
      const p = routeSubnet(nic ? `${nic.ip}/${nic.prefix}` : scope.cidr);
      const ip = ipNumber(targetIp);
      if (ip >= p.start && ip <= p.end) {
        const path = layer2Path(network, source!.id, to, scope.id);
        return path
          ? { path }
          : {
              path: [source!.id],
              error: `ARP/L2: cel w VLAN ${scope.id} nie jest dostępny w tej samej domenie rozgłoszeniowej.`,
            };
      }
    }
    const needsGateway = normal && scope && !onLink;
    if (needsGateway) {
      const gateway = nic
        ? network.devices.find(
            (d) =>
              nic.gateway &&
              (d.ip === nic.gateway ||
                d.interfaces?.some((n) => n.enabled && n.ip === nic.gateway) ||
                network.vlans.some((v) => v.gateway === nic.gateway && v.gatewayDeviceId === d.id)),
          )
        : byId.get(scope.gatewayDeviceId || '');
      if (
        nic &&
        (!nic.gateway ||
          !addressInPrefix(nic.gateway, nic.ip, nic.prefix) ||
          nic.gateway === nic.ip)
      )
        return {
          path: [source!.id],
          error: 'Brak bramy interfejsu lub brama jest poza jego podsiecią.',
        };
      if (!gateway)
        return { path: [source!.id], error: `Brak skonfigurowanej bramy L3 dla VLAN ${scope.id}.` };
      const first = layer2Path(network, source!.id, gateway.id, scope.id);
      if (!first)
        return {
          path: [source!.id],
          error: `Nieosiągalna brama ${scope.gateway} w VLAN ${scope.id}. Sprawdź access/trunk i połączenia.`,
        };
      if (to === gateway.id) return { path: first };
      const rest = findPath(gateway.id, to, destinationIp);
      return { path: [...first, ...rest.path.slice(1)], error: rest.error };
    }
    return findPath(source!.id, to, destinationIp);
  }
  let plan: Plan;
  if (translation) {
    const first = sourcePath(translation.owner.id, requestedIp);
    if (first.error) plan = first;
    else if (!target)
      plan = {
        path: first.path,
        error: `NAT wskazuje ${targetIp}, ale takiego urządzenia nie ma w projekcie.`,
      };
    else {
      const second = findPath(translation.owner.id, target.id, targetIp);
      plan = { path: [...first.path, ...second.path.slice(1)], error: second.error };
      if (!second.path.length) plan.error = 'Brak wewnętrznej ścieżki od firewalla do celu NAT.';
    }
  } else plan = sourcePath(target!.id, requestedIp);
  if (!plan.path.length) return fail(plan.error || 'Brak ścieżki.');
  const routedNodes = new Set<string>();
  const routedIndices = new Set<number>();
  let sourceIp = options.sourceAddress || source.ip;
  let destinationIp = requestedIp;
  let port = probe.port;
  let vlan = source.vlan;
  const steps: string[] = [];
  for (let i = 0; i < plan.path.length; i++) {
    const d = byId.get(plan.path[i])!;
    const prev = byId.get(plan.path[i - 1]);
    const messages: string[] = [];
    const switching =
      d.kind === 'switch-l3' && i > 0 && i < plan.path.length - 1 && !!vlan && vlan === targetVlan;
    const routingHop = isRoutingDevice(d) && !switching;
    if (routingHop) {
      routedIndices.add(i);
      if (routedNodes.has(d.id))
        return fail(
          'Pętla routingu: to samo urządzenie L3 zostało odwiedzone ponownie.',
          plan.path.slice(0, i + 1),
          steps,
        );
      routedNodes.add(d.id);
    }
    const stop = (reason: string) =>
      fail(reason, plan.path.slice(0, i + 1), [
        ...steps,
        `${d.name}: ${[...messages, reason].join(' ')}`,
      ]);
    if (i > 0) {
      const wireVlan = vlan || (!isRoutingDevice(d) ? d.vlan : 0);
      const prevRoute =
        prev?.routingMode === 'static' ? selectRoute(prev, destinationIp) : undefined;
      const prevNextHop = prevRoute && byId.get(prevRoute.nextHopId);
      const boundPort = routedIndices.has(i - 1)
        ? routedInterface(prev!, destinationIp)?.portId ||
          (prevNextHop && connectedNextHop(network, prev!, prevNextHop)?.portId)
        : undefined;
      const candidates = links.filter(
        (l) =>
          ((l.a === prev?.id && l.b === d.id) || (l.b === prev?.id && l.a === d.id)) &&
          (!boundPort || (l.a === prev?.id ? l.aPortId : l.bPortId) === boundPort),
      );
      const transmissions = candidates.map((wire) => ({
        wire,
        sent: transferVlan(network, wire, prev!.id, wireVlan),
      }));
      const selectedWire =
        transmissions.find((t) => !t.sent.error && t.sent.vlan === wireVlan) ||
        transmissions.find((t) => !t.sent.error) ||
        transmissions[0];
      if (selectedWire) {
        traversedLinks.push(selectedWire.wire.id);
        if (selectedWire.sent.error) return stop(selectedWire.sent.error);
        vlan = selectedWire.sent.vlan;
      } else return stop('Brak zgodnego fizycznego portu do następnego urządzenia.');
      if (routingHop) {
        if (
          vlan &&
          network.vlans.find((v) => v.id === vlan)?.gatewayDeviceId &&
          !vlanInterface(network, d, vlan)
        )
          return stop(
            `Urządzenie nie ma interfejsu L3 w VLAN ${vlan}. Skonfiguruj bramę/SVI tej sieci.`,
          );
        if (
          d.kind === 'switch-l3' &&
          d.allowedVlans?.length &&
          ((vlan && !d.allowedVlans.includes(vlan)) ||
            (targetVlan && !d.allowedVlans.includes(targetVlan)))
        )
          return stop('Switch L3 nie obsługuje źródłowego lub docelowego VLAN-u.');
        vlan = 0;
        const nextRouter = plan.path.slice(i + 1).some((id) => isRoutingDevice(byId.get(id)!));
        const finalVlan = targetVlan;
        if (
          !nextRouter &&
          finalVlan &&
          !(plan.error && i === plan.path.length - 1) &&
          network.vlans.find((v) => v.id === finalVlan)?.gatewayDeviceId &&
          !vlanInterface(network, d, finalVlan)
        )
          return stop(`Brak interfejsu lub trasy do VLAN ${finalVlan} na tym urządzeniu L3.`);
      } else if (isHypervisor(d) && i < plan.path.length - 1) {
        /* Transit uses the guest VLAN; traffic to the host uses its management VLAN. */
      } else if (
        (d.kind === 'switch' || switching || d.kind === 'accesspoint') &&
        i < plan.path.length - 1
      ) {
        if (vlan && !bridgesVlan(d, vlan))
          return stop(`VLAN ${vlan} nie jest przenoszony przez ${d.name}.`);
      } else {
        if (vlan && d.vlan && vlan !== d.vlan)
          return stop(`VLAN ${vlan} → ${d.vlan}: wymagany router, firewall lub switch L3.`);
        if (d.vlan) vlan = d.vlan;
      }
    }
    if (
      routingHop &&
      (!plan.path.slice(i + 1).some((id) => isRoutingDevice(byId.get(id)!)) ||
        (target &&
          targetVlan &&
          vlanInterface(network, d, targetVlan) &&
          layer2Path(network, d.id, target.id, targetVlan)))
    )
      vlan = targetVlan || 0;
    if (
      routingHop &&
      i < plan.path.length - 1 &&
      d.routingMode === 'static' &&
      !routedInterface(d, destinationIp)
    ) {
      const route = selectRoute(d, destinationIp);
      const peer = route && byId.get(route.nextHopId);
      const hop = peer && connectedNextHop(network, d, peer);
      if (hop && !(target && targetVlan && layer2Path(network, d.id, target.id, targetVlan)))
        vlan = hop.vlan;
    }
    if (translation?.owner.id === d.id) {
      destinationIp = translation.ip;
      port = translation.port;
      messages.push(
        `${translation.label}: ${requestedIp}${probe.protocol === 'ICMP' ? '' : ':' + probe.port} → ${destinationIp}${probe.protocol === 'ICMP' ? '' : ':' + port}.`,
      );
    }
    if (i > 0 && !switching && hasAcl(d) && !options.stateful?.has(d.id)) {
      const rule = d.rules.find(
        (r) =>
          (r.protocol === 'ANY' || r.protocol === probe.protocol) &&
          (r.port === '*' || (probe.protocol !== 'ICMP' && r.port === String(port))) &&
          (!r.ingress || r.ingress === 'any' || r.ingress === (outside ? 'wan' : 'lan')) &&
          matchesAclAddress(r.source, sourceIp, network) &&
          matchesAclAddress(r.destination, destinationIp, network),
      );
      const action = rule?.action || d.defaultAcl || 'deny';
      if (action === 'deny')
        return stop(
          `${rule ? `Reguła ACL ${d.rules.indexOf(rule) + 1} (${rule.id})` : 'Domyślna ACL deny any'} blokuje ${probe.protocol}${probe.protocol === 'ICMP' ? '' : ' / ' + port}.`,
        );
      messages.push(
        rule
          ? `ACL permit — reguła ${d.rules.indexOf(rule) + 1} (${rule.id}).`
          : 'ACL permit any — polityka domyślna.',
      );
    } else if (options.stateful?.has(d.id))
      messages.push('Odpowiedź dopuszczona przez stan wcześniej dozwolonego połączenia.');
    if (hasWan(d) && target?.kind === 'internet') {
      const nat = d.staticNat?.find((r) => r.enabled && r.privateIp === sourceIp);
      if (options.sourceNat?.ownerId === d.id) {
        messages.push(`Odwrotna translacja połączenia: ${sourceIp} → ${options.sourceNat.ip}.`);
        sourceIp = options.sourceNat.ip;
      } else if (nat) {
        messages.push(`Static NAT / SNAT: ${sourceIp} → ${nat.publicIp}.`);
        sourceIp = nat.publicIp;
      } else if (d.outboundNat && d.wanIp) {
        messages.push(`NAT wyjściowy / masquerade: ${sourceIp} → ${d.wanIp}.`);
        sourceIp = d.wanIp;
      }
    }
    if (i === plan.path.length - 1 && plan.error) return stop(plan.error);
    if (i === plan.path.length - 1 && target?.kind === 'internet' && !isPublicModelIp(sourceIp))
      return stop(
        'Prywatny adres źródła nie jest routowany w Internecie. Skonfiguruj NAT wyjściowy lub poprawne mapowanie publicznego adresu.',
      );
    if (
      i === plan.path.length - 1 &&
      publicOwner &&
      probe.protocol !== 'ICMP' &&
      !(publicOwner.services || []).some(
        (s) => s.enabled && s.protocol === probe.protocol && s.port === port,
      )
    )
      return stop('Brak aktywnego port forwarding lub static NAT dla tej usługi.');
    if (
      !options.reply &&
      i === plan.path.length - 1 &&
      probe.protocol !== 'ICMP' &&
      target &&
      target.kind !== 'internet'
    ) {
      const services = target.services || defaultServices(target.kind);
      if (!services.some((s) => s.enabled && s.protocol === probe.protocol && s.port === port))
        return {
          ...stop(
            `Pakiet dotarł do ${target.name}, ale ${probe.protocol}/${port} jest zamknięty — brak aktywnej usługi.`,
          ),
          verdict: 'closed',
        };
      messages.push(`Usługa ${probe.protocol}/${port} odpowiada.`);
    }
    if (isRoutingDevice(d) && d.routingMode === 'static' && i < plan.path.length - 1) {
      const route = selectRoute(d, destinationIp);
      if (route)
        messages.push(
          `Trasa ${route.destination}, metryka ${route.metric}, przez ${byId.get(route.nextHopId)?.name || route.nextHopId}.`,
        );
    }
    if (isHypervisor(d)) messages.push('Przełącznik wirtualny hypervisora.');
    if (d.kind === 'accesspoint') messages.push(`Most Wi-Fi${d.ssid ? ' „' + d.ssid + '”' : ''}.`);
    if (d.kind === 'switch-unmanaged')
      messages.push('Switch L2 niezarządzalny: jedna sieć dostępu.');
    if (d.kind === 'switch-l3') messages.push('Routing między VLAN-ami na switchu L3.');
    messages.push(
      i === 0
        ? `Wysłano ${probe.protocol}.`
        : i === plan.path.length - 1
          ? 'Odebrano pakiet.'
          : 'Przekazano pakiet.',
    );
    steps.push(`${d.name}: ${messages.join(' ')}`);
  }
  const result: Result = {
    ok: true,
    path: plan.path,
    reason: 'Pakiet dotarł do celu.',
    steps,
    packet: { sourceIp, destinationIp, port },
    verdict: 'allowed',
    linkPath: [...traversedLinks],
  };
  if (probe.checkReply && !options.reply && target) {
    const stateful = new Set(
      plan.path.filter((id) => {
        const d = byId.get(id)!;
        return hasWan(d) || ['gateway', 'firewall'].includes(d.kind);
      }),
    );
    const outboundOwner = plan.path
      .map((id) => byId.get(id)!)
      .find(
        (d) =>
          hasWan(d) &&
          (d.outboundNat || d.staticNat?.some((n) => n.enabled && n.privateIp === source.ip)),
      );
    const reply = simulateNetwork(
      network,
      {
        source: target.id,
        destination: source.interfaces?.length ? source.ip : source.id,
        protocol: probe.protocol,
        port: probe.protocol === 'ICMP' ? 0 : 49152,
        checkReply: false,
      },
      {
        reply: true,
        controlPlane: options.controlPlane,
        sourceAddress: targetIp,
        stateful,
        ...(translation || publicOwner
          ? { sourceNat: { ownerId: translation?.owner.id || publicOwner!.id, ip: requestedIp } }
          : {}),
        ...(outboundOwner && target.kind === 'internet' && sourceIp !== source.ip
          ? {
              destinationNat: {
                ownerId: outboundOwner.id,
                publicIp: sourceIp,
                privateIp: source.ip,
              },
            }
          : {}),
      },
    );
    result.returnPath = reply.path;
    result.returnLinkPath = reply.linkPath;
    result.steps.push(...reply.steps.slice(1).map((s) => `Odpowiedź: ${s}`));
    result.ok = reply.ok;
    result.reason = reply.ok
      ? probe.protocol === 'ICMP'
        ? 'ICMP Echo Reply wrócił do źródła.'
        : `${probe.protocol}/${port}: usługa dostępna, trasa odpowiedzi sprawdzona.`
      : `Brak poprawnej odpowiedzi: ${reply.reason}`;
    if (!reply.ok) {
      result.verdict = 'unreachable';
      if (!reply.path.length) result.steps[result.steps.length - 1] += ` ${result.reason}`;
    }
  }
  return result;
}

export function simulateNetwork(
  network: Network,
  probe: Probe,
  options: EngineOptions = {},
): Result {
  const leased = options.controlPlane ? network : reconcileDhcp(network);
  if (!options.controlPlane) {
    const client = leased.devices.find(
      (d) =>
        (d.id === probe.source || d.id === probe.destination || d.ip === probe.destination) &&
        d.accessSession &&
        d.accessSession.state !== 'accepted',
    );
    if (client?.accessSession)
      return {
        ok: false,
        path: [probe.source],
        reason: client.accessSession.reason,
        steps: [client.accessSession.reason],
        verdict: 'blocked',
      };
  }
  const hw = hardwareState(leased);
  const targetDevice = leased.devices.find(
    (d) =>
      d.id === probe.destination ||
      d.ip === probe.destination ||
      d.interfaces?.some((n) => n.ip === probe.destination),
  );
  const sourcePower =
    hw.powerErrors.get(probe.source) || (targetDevice && hw.powerErrors.get(targetDevice.id));
  if (sourcePower)
    return {
      ok: false,
      path: [probe.source],
      steps: [sourcePower],
      reason: sourcePower,
      verdict: 'unreachable',
    };
  const publicDestination =
    leased.devices.find((d) => d.id === probe.source)?.kind === 'internet' && targetDevice?.wanIp
      ? targetDevice.wanIp
      : probe.destination;
  const mappedTargetIp = leased.devices.filter(hasWan).flatMap((d) => {
    const pf = d.portForwards?.find(
      (r) =>
        r.enabled &&
        r.externalIp === publicDestination &&
        r.externalPort === probe.port &&
        r.protocol === probe.protocol,
    );
    const nat = d.staticNat?.find((r) => r.enabled && r.publicIp === publicDestination);
    return pf ? [pf.internalIp] : nat ? [nat.privateIp] : [];
  })[0];
  const projected = projectHostInterfaces(operationalNetwork(leased), probe, mappedTargetIp);
  if (projected.error)
    return {
      ok: false,
      path: [probe.source],
      steps: [projected.error],
      reason: projected.error,
      verdict: 'unreachable',
    };
  const result = simulatePacket(projected.network, probe, options);
  result.sourceInterfaceId = projected.sourceNic?.id;
  result.destinationInterfaceId = projected.targetNic?.id;
  if (result.ok || result.path.length > 1) {
    const pathLinks = topologyLinks(projected.network);
    const speeds = result.path.slice(1).flatMap((id, i) => {
      const l = result.linkPath?.[i]
        ? pathLinks.find((l) => l.id === result.linkPath![i])
        : pathLinks.find(
            (l) => (l.a === result.path[i] && l.b === id) || (l.b === result.path[i] && l.a === id),
          );
      const physical = l
        ? hw.links.get(l.id) || physicalLinkState(projected.network, l)
        : undefined;
      if (l && (l.aPortId || l.bPortId)) {
        const state = physical;
        const forward = l.a === result.path[i];
        const from = forward ? state?.aPort?.name : state?.bPort?.name;
        const to = forward ? state?.bPort?.name : state?.aPort?.name;
        const step = Math.min(i + 1, result.steps.length - 1);
        if (step >= 0)
          result.steps[step] +=
            ` Porty ${from || 'auto'} → ${to || 'auto'}; ${state?.speedMbps || 0} Mb/s.${state?.warnings.length ? ' ' + state.warnings.join(' ') : ''}`;
      }
      return physical ? [physical.speedMbps] : [];
    });
    if (speeds.length) result.bottleneckMbps = Math.min(...speeds);
  }
  if (!result.ok && result.path.length <= 1) {
    const errors = leased.links
      .filter((l) => l.a === probe.source || l.b === probe.source)
      .flatMap((l) => hw.links.get(l.id)?.errors || []);
    if (errors.length) {
      result.reason += ' ' + [...new Set(errors)].join(' ');
      result.steps[result.steps.length - 1] = result.reason;
    }
  }
  if (!options.controlPlane) {
    const session = leased.devices.find((d) => d.id === probe.source)?.accessSession;
    if (session && result.steps.length)
      result.steps[0] = `${session.reason} Accounting: ${session.accounting}. ${result.steps[0]}`;
  }
  return result;
}
