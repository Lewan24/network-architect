import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortPanel } from '../components/PortPanel';
import { createPortConnection, portUnavailable, suggestedCable } from '../model/portConnections';
import { makePort } from '../model/ports';
import { internetConnection } from '../model/internetModel';
import type { Device, Network } from '../model/networkTypes';
const device = (id: string, kind: Device['kind'] = 'switch'): Device => ({
  id,
  kind,
  name: id,
  online: true,
  ip: '',
  ipMode: 'auto',
  vlan: 1,
  x: 0,
  y: 0,
  rules: [],
  ports: [makePort('eth0'), makePort('eth1'), { ...makePort('eth2'), enabled: false }],
});
const network = (): Network => ({
  name: 'Ports',
  vlans: [],
  devices: [device('a'), device('b')],
  links: [],
});
describe('explicit cable endpoints', () => {
  it('keeps both selected sockets and leaves the input unchanged', () => {
    const n = network();
    const before = structuredClone(n);
    const next = createPortConnection(n, 'a', 'eth1', 'b', 'eth0', 'c1', {
      cable: 'cat6a',
      lengthMeters: 12,
    });
    expect(next.links[0]).toMatchObject({
      aPortId: 'eth1',
      bPortId: 'eth0',
      cable: 'cat6a',
      lengthMeters: 12,
    });
    expect(n).toEqual(before);
    expect(() => createPortConnection(next, 'a', 'eth1', 'b', 'eth1', 'c2')).toThrow(/zajęty/);
    expect(createPortConnection(next, 'a', 'eth0', 'b', 'eth1', 'c2').links).toHaveLength(2);
  });
  it('rejects disabled, missing, self and incompatible ports without creating a cable', () => {
    const n = network();
    expect(() => createPortConnection(n, 'a', 'eth2', 'b', 'eth0', 'x')).toThrow(/wyłączony/);
    expect(() => createPortConnection(n, 'a', 'missing', 'b', 'eth0', 'x')).toThrow(/istnieje/);
    expect(() => createPortConnection(n, 'a', 'eth0', 'a', 'eth1', 'x')).toThrow(/różne/);
    n.devices[1].ports![0].connector = 'sfp';
    expect(() => createPortConnection(n, 'a', 'eth0', 'b', 'eth0', 'x')).toThrow(/gniazda/);
    expect(n.links).toHaveLength(0);
  });
  it('reserves a single association on a client radio while allowing shared AP radio', () => {
    const n = network();
    n.devices = [
      device('ap', 'accesspoint'),
      device('p1', 'mobile-phone'),
      device('p2', 'mobile-phone'),
    ];
    for (const d of n.devices) d.ports = [makePort('wifi', 'wifi')];
    const one = createPortConnection(n, 'ap', 'wifi', 'p1', 'wifi', 'w1');
    const two = createPortConnection(one, 'ap', 'wifi', 'p2', 'wifi', 'w2');
    expect(two.links.map((l) => l.cable)).toEqual(['wireless', 'wireless']);
    expect(portUnavailable(two, two.devices[1], two.devices[1].ports![0])).toMatch(/zajęty/);
    expect(portUnavailable(two, two.devices[0], two.devices[0].ports![0])).toBeUndefined();
    expect(() => createPortConnection(n, 'p1', 'wifi', 'p2', 'wifi', 'bad')).toThrow(/dostępowego/);
  });
  it('preserves selected WAN sockets and the Internet edge configuration', () => {
    const n = network();
    n.devices = [device('wan', 'internet'), device('edge', 'router')];
    const next = createPortConnection(n, 'edge', 'eth1', 'wan', 'eth0', 'wan-link');
    expect(next.links[0]).toMatchObject({ a: 'edge', aPortId: 'eth1', b: 'wan', bPortId: 'eth0' });
    expect(internetConnection(next).edge?.id).toBe('edge');
    expect(internetConnection(next).edge?.wanIp).toBeTruthy();
  });
  it('selects optical media for modules and DAC for empty SFP+ cages', () => {
    const p = makePort('sfp', 'sfp+');
    expect(suggestedCable(p, p)).toBe('dac');
    expect(suggestedCable({ ...p, module: '10g-lr' }, p)).toBe('os2');
    expect(suggestedCable({ ...p, module: '10g-sr' }, p)).toBe('om3');
    const n = network();
    expect(() => createPortConnection(n, 'a', 'eth0', 'b', 'eth0', 'x', { cable: 'om3' })).toThrow(
      /medium/,
    );
    expect(() =>
      createPortConnection(n, 'a', 'eth0', 'b', 'eth0', 'x', { lengthMeters: NaN }),
    ).toThrow(/długość/);
  });
});
describe('front panel states', () => {
  it('shows connected ports green, free ports gray, disabled ports black, with names and selection', () => {
    const n = createPortConnection(network(), 'a', 'eth0', 'b', 'eth0', 'c1');
    const html = renderToStaticMarkup(
      <PortPanel device={n.devices[0]} network={n} selected="eth1" choose={() => {}} />,
    );
    expect(html).toMatch(/class="port-slot up /);
    expect(html).toMatch(/class="port-slot free selected"/);
    expect(html).toMatch(/class="port-slot disabled /);
    expect(html).toContain('Port eth0 · RJ45 · aktywny');
    expect(html).toContain('aria-pressed="true"');
    n.devices[1].online = false;
    const offline = renderToStaticMarkup(
      <PortPanel device={n.devices[0]} network={n} choose={() => {}} />,
    );
    expect(offline).toContain('podłączony, brak aktywnego linku');
    expect(offline).not.toMatch(/class="port-slot up /);
  });
});
