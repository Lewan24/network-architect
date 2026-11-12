import { simulateNetwork } from '../simulation/networkEngine';
import { physicalLinkState, operationalNetwork } from './ports';
import type { Device, Link, Network, RadiusEvent, RadiusSession } from './networkTypes';

export const isRadiusNas = (d: Device) => ['accesspoint', 'switch', 'switch-l3'].includes(d.kind);
export const isSupplicant = (d: Device) =>
  [
    'workstation',
    'laptop',
    'mobile-phone',
    'iot',
    'mini-server',
    'server',
    'printer',
    'camera',
    'nvr',
    'ups',
  ].includes(d.kind);

/** A managed switch controls only explicitly enabled access ports; an AP controls its SSID. */
export function controlledAccess(network: Network, link: Link) {
  for (const side of ['a', 'b'] as const) {
    const nas = network.devices.find((d) => d.id === link[side]);
    const client = network.devices.find((d) => d.id === link[side === 'a' ? 'b' : 'a']);
    if (!nas || !client || !isRadiusNas(nas)) continue;
    const port = nas.ports?.find((p) => p.id === link[`${side}PortId`]);
    if (
      (nas.kind === 'accesspoint' &&
        nas.wifiEnterprise &&
        (port?.connector === 'wifi' || link.cable === 'wireless')) ||
      port?.dot1x
    )
      return { nas, client, port };
  }
}

/** Uncontrolled access still needs a normal IP path. There is no guest/fail-open fallback. */
export function projectNetworkAccess(network: Network, now = Date.now()): Network {
  const controls = network.links.flatMap((link) => {
    const control = controlledAccess(network, link);
    return control ? [{ ...control, link }] : [];
  });
  if (!controls.length && !network.devices.some((d) => d.accessSession)) return network;
  const events: RadiusEvent[] = [...(network.radiusEvents || [])];
  const devices: Device[] = network.devices.map((d) => {
    const old = d.accessSession;
    const baseVlan = old && d.vlan === old.vlan ? old.baseVlan : d.vlan;
    return {
      ...d,
      vlan: baseVlan,
      accessSession: undefined,
      interfaces: d.interfaces?.map((nic, i) =>
        i === 0 && old ? { ...nic, vlan: baseVlan } : nic,
      ),
    };
  });
  const next: Network = { ...network, devices };
  // Control-plane probes must not use stale data-plane sessions or recursively authenticate.
  const active = operationalNetwork(next);
  const add = (
    client: Device,
    session: RadiusSession,
    type: RadiusEvent['type'],
    message: string,
  ) =>
    events.push({
      time: now,
      deviceId: client.id,
      username: session.username,
      nasId: session.nasId,
      serverId: session.serverId,
      type,
      message,
    });
  const processed = new Set<string>();
  for (const { nas, client, link, port } of controls) {
    if (processed.has(client.id)) continue;
    processed.add(client.id);
    const d = devices.find((d) => d.id === client.id)!;
    const previous = client.accessSession;
    const config = nas.radiusNas;
    const server = devices.find((s) => s.id === config?.serverId && s.kind === 'radius');
    const session: RadiusSession = {
      state: 'rejected',
      username: d.supplicant?.username || '',
      nasId: nas.id,
      serverId: config?.serverId || '',
      baseVlan: d.vlan,
      vlan: d.vlan,
      reason: '',
      accounting: 'disabled',
      authPath: [],
    };
    const reject = (reason: string, unavailable = false) => {
      session.reason = reason;
      session.state = unavailable ? 'unavailable' : 'rejected';
    };
    if (
      controls.filter((c) => c.client.id === client.id).length > 1 ||
      (d.interfaces?.length || 0) > 1
    )
      reject('802.1X: model obsługuje jeden kontrolowany interfejs klienta.');
    else if (
      !active.devices.find((n) => n.id === nas.id)?.online ||
      !active.devices.find((n) => n.id === client.id)?.online ||
      d.interfaces?.[0]?.enabled === false ||
      !physicalLinkState(active, link).up
    )
      reject('802.1X: klient, NAS lub łącze jest nieaktywne.', true);
    else if (!config || !server || !server.online || !server.ip)
      reject('RADIUS: brak dostępnego serwera lub konfiguracji NAS.', true);
    else {
      const registered = server.radius?.clients.find((c) => c.nasId === nas.id);
      if (!registered || !registered.secret || registered.secret !== config.secret)
        reject('RADIUS: nieznany NAS lub niezgodny shared secret.');
      else {
        const response = simulateNetwork(
          next,
          { source: nas.id, destination: server.id, protocol: 'UDP', port: 1812, checkReply: true },
          { controlPlane: true },
        );
        session.authPath = response.path;
        if (!response.ok) reject(`RADIUS UDP/1812: ${response.reason}`, true);
        else {
          const user = server.radius?.users.find((u) => u.username === d.supplicant?.username);
          if (!d.supplicant || !user || !user.enabled || user.password !== d.supplicant.password)
            reject('Access-Reject: niepoprawne dane logowania lub konto jest wyłączone.');
          else if (
            !user.authorized ||
            (user.allowedNasIds?.length && !user.allowedNasIds.includes(nas.id))
          )
            reject('Access-Reject: użytkownik nie ma autoryzacji dla tego NAS.');
          else {
            const vlan =
              config.dynamicVlan && user.vlan !== undefined
                ? user.vlan
                : nas.kind === 'accesspoint'
                  ? (nas.wifiVlan ?? nas.vlan)
                  : (port?.accessVlan ?? link.accessVlan ?? d.vlan);
            if (!next.vlans.some((v) => v.id === vlan))
              reject('Access-Reject: polityka wskazuje nieistniejący VLAN.');
            else {
              session.state = 'accepted';
              session.vlan = vlan;
              session.reason = `Access-Accept: ${user.username}${user.role ? ` (${user.role})` : ''}, VLAN ${vlan}.`;
              d.vlan = vlan;
              if (d.interfaces?.[0]) d.interfaces[0] = { ...d.interfaces[0], vlan };
              if (config.accounting) {
                const result = simulateNetwork(
                  next,
                  {
                    source: nas.id,
                    destination: server.id,
                    protocol: 'UDP',
                    port: 1813,
                    checkReply: true,
                  },
                  { controlPlane: true },
                );
                session.accounting = result.ok ? 'recorded' : 'unavailable';
              }
            }
          }
        }
      }
    }
    d.accessSession = session;
    if (previous?.vlan !== session.vlan || session.state !== 'accepted') {
      if (d.ipMode === 'auto') {
        d.ip = '';
        delete d.lease;
      }
      if (d.interfaces?.[0]?.ipMode === 'auto')
        d.interfaces[0] = { ...d.interfaces[0], ip: '', lease: undefined };
    }
    const changed =
      !previous ||
      ['state', 'username', 'nasId', 'serverId', 'vlan', 'reason', 'accounting'].some(
        (key) => previous[key as keyof RadiusSession] !== session[key as keyof RadiusSession],
      );
    if (changed) {
      if (previous?.accounting === 'recorded' && previous.state === 'accepted')
        add(d, previous, 'accounting-stop', 'Zakończono poprzednią sesję (zdarzenie modelu).');
      add(d, session, session.state === 'accepted' ? 'accept' : 'reject', session.reason);
      if (session.accounting === 'recorded')
        add(
          d,
          session,
          'accounting-start',
          `Accounting-Request/Response UDP/1813 · VLAN ${session.vlan}.`,
        );
    }
  }
  for (const old of network.devices.filter(
    (d) => d.accessSession && !controls.some((c) => c.client.id === d.id),
  )) {
    if (old.accessSession!.accounting === 'recorded')
      add(
        old,
        old.accessSession!,
        'accounting-stop',
        'Sesja zakończona: odłączenie portu lub wyłączenie kontroli dostępu.',
      );
    const d = devices.find((d) => d.id === old.id)!;
    if (d.ipMode === 'auto' && old.vlan !== d.vlan) {
      d.ip = '';
      delete d.lease;
    }
  }
  return { ...next, radiusEvents: events.slice(-200) };
}

export function validateRadius(d: Device, network?: Network) {
  const text = (v: unknown, max = 80) => typeof v === 'string' && v.length <= max;
  const vlan = (v: unknown) =>
    Number.isInteger(v) &&
    Number(v) >= 1 &&
    Number(v) <= 4094 &&
    (!network || network.vlans.some((n) => n.id === v));
  if (d.radius !== undefined) {
    if (
      d.kind !== 'radius' ||
      !d.radius ||
      !Array.isArray(d.radius.users) ||
      d.radius.users.length > 256 ||
      !Array.isArray(d.radius.clients) ||
      d.radius.clients.length > 256
    )
      throw Error('Nieprawidłowa konfiguracja serwera RADIUS.');
    const users = new Set<string>();
    const ids = new Set<string>();
    for (const u of d.radius.users) {
      if (
        !u ||
        !text(u.id) ||
        !u.id ||
        ids.has(u.id) ||
        !text(u.username) ||
        !u.username.trim() ||
        users.has(u.username) ||
        !text(u.password, 128) ||
        !u.password ||
        typeof u.enabled !== 'boolean' ||
        typeof u.authorized !== 'boolean' ||
        !text(u.role) ||
        (u.vlan !== undefined && !vlan(u.vlan)) ||
        (u.allowedNasIds !== undefined &&
          (!Array.isArray(u.allowedNasIds) ||
            u.allowedNasIds.length > 256 ||
            u.allowedNasIds.some(
              (id) =>
                !text(id) ||
                (network && !network.devices.some((n) => n.id === id && isRadiusNas(n))),
            )))
      )
        throw Error('RADIUS: sprawdź unikalne konta, hasła testowe, autoryzację i VLAN-y.');
      users.add(u.username);
      ids.add(u.id);
    }
    const clients = new Set<string>();
    for (const c of d.radius.clients) {
      if (
        !c ||
        !text(c.nasId) ||
        !c.nasId ||
        clients.has(c.nasId) ||
        !text(c.secret, 128) ||
        !c.secret ||
        (network && !network.devices.some((n) => n.id === c.nasId && isRadiusNas(n)))
      )
        throw Error('RADIUS: klient NAS musi być unikalnym AP lub switchem i mieć shared secret.');
      clients.add(c.nasId);
    }
  }
  if (d.radiusNas !== undefined) {
    const n = d.radiusNas;
    if (
      !isRadiusNas(d) ||
      !n ||
      !text(n.serverId) ||
      !text(n.secret, 128) ||
      !n.secret ||
      typeof n.dynamicVlan !== 'boolean' ||
      typeof n.accounting !== 'boolean' ||
      (n.serverId &&
        network &&
        !network.devices.some((s) => s.id === n.serverId && s.kind === 'radius'))
    )
      throw Error('NAS wymaga serwera RADIUS, shared secret i prawidłowych opcji AAA.');
  }
  if (
    d.wifiEnterprise !== undefined &&
    (d.kind !== 'accesspoint' || typeof d.wifiEnterprise !== 'boolean')
  )
    throw Error('WPA Enterprise jest ustawieniem AP.');
  if (d.wifiEnterprise && !d.radiusNas) throw Error('WPA Enterprise wymaga konfiguracji NAS.');
  for (const p of d.ports || [])
    if (
      p.dot1x !== undefined &&
      (typeof p.dot1x !== 'boolean' ||
        (p.dot1x &&
          (!['switch', 'switch-l3'].includes(d.kind) ||
            p.connector !== 'rj45' ||
            p.mode === 'trunk' ||
            !d.radiusNas)))
    )
      throw Error('802.1X wymaga konfiguracji NAS i portu dostępowego RJ45 zarządzalnego switcha.');
  if (
    d.supplicant !== undefined &&
    (!isSupplicant(d) ||
      !d.supplicant ||
      !text(d.supplicant.username) ||
      !text(d.supplicant.password, 128))
  )
    throw Error('Nieprawidłowy profil logowania 802.1X.');
  if (d.accessSession !== undefined) {
    const s = d.accessSession;
    if (
      !s ||
      !['accepted', 'rejected', 'unavailable'].includes(s.state) ||
      !text(s.username) ||
      !text(s.nasId) ||
      !text(s.serverId) ||
      !Number.isInteger(s.baseVlan) ||
      s.baseVlan < 0 ||
      s.baseVlan > 4094 ||
      !Number.isInteger(s.vlan) ||
      s.vlan < 0 ||
      s.vlan > 4094 ||
      !text(s.reason, 4096) ||
      !['recorded', 'unavailable', 'disabled'].includes(s.accounting) ||
      !Array.isArray(s.authPath) ||
      s.authPath.length > 500 ||
      s.authPath.some((id) => !text(id))
    )
      throw Error('Nieprawidłowy zapis stanu sesji RADIUS.');
  }
}

export function validateRadiusEvents(network: Network) {
  if (network.radiusEvents === undefined) return;
  if (
    !Array.isArray(network.radiusEvents) ||
    network.radiusEvents.length > 200 ||
    network.radiusEvents.some(
      (e) =>
        !e ||
        !Number.isFinite(e.time) ||
        !['accept', 'reject', 'accounting-start', 'accounting-stop'].includes(e.type) ||
        [e.deviceId, e.username, e.nasId, e.serverId, e.message].some(
          (v) => typeof v !== 'string' || v.length > 4096,
        ),
    )
  )
    throw Error('Nieprawidłowy dziennik RADIUS.');
}
