import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AclEditor } from '../editors/AclEditor';
import { AclAddressPicker } from '../editors/AclAddressPicker';
import { DeviceOptions } from '../components/DeviceOptions';
import type { Device, Network } from '../model/networkTypes';
const host = (id: string, vlan: number): Device => ({
  id,
  name: id,
  kind: 'laptop',
  vlan,
  ip: '',
  ipMode: 'auto',
  online: true,
  x: 0,
  y: 0,
  rules: [],
});
const network: Network = {
  name: 'Controls',
  links: [],
  devices: [host('Zebra', 20), host('Alfa', 20), host('Admin', 99), host('WAN', 0)],
  vlans: [
    {
      id: 99,
      name: 'Administracja',
      cidr: '192.168.99.0/24',
      gateway: '192.168.99.1',
      color: '#123456',
    },
    { id: 20, name: 'Serwery', cidr: '192.168.20.0/24', gateway: '192.168.20.1', color: '#123456' },
  ],
};
function find(node: ReactNode, label: string): Record<string, any> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, any>>(child)) continue;
    if (child.props['aria-label'] === label) return child.props;
    const found = find(child.props.children, label);
    if (found) return found;
  }
}
describe('ACL editing controls', () => {
  it('inserts and edits a rule in the middle while preserving existing order and can remove it again', () => {
    const first = {
      id: 'first',
      action: 'deny' as const,
      protocol: 'ANY' as const,
      port: '*',
      source: 'vlan:20',
      destination: 'vlan:99',
    };
    const last = {
      id: 'last',
      action: 'allow' as const,
      protocol: 'TCP' as const,
      port: '443',
      source: '*',
      destination: '*',
    };
    let device: Device = { ...host('router', 20), kind: 'gateway', rules: [first, last] };
    const render = () =>
      AclEditor({
        device,
        network,
        patch: (p) => {
          device = { ...device, ...p };
        },
      });
    find(render(), 'Wstaw regułę przed pozycją 2')!.onClick();
    expect(device.rules).toHaveLength(3);
    expect(device.rules[0]).toBe(first);
    expect(device.rules[2]).toBe(last);
    expect(device.rules[1]).toMatchObject({ action: 'allow', protocol: 'TCP', port: '443' });
    find(render(), 'ACL 2: port')!.onChange({ target: { value: '631' } });
    expect(device.rules[1].port).toBe('631');
    expect(device.rules[2].port).toBe('443');
    const row = find(render(), 'Reguła ACL 2')!;
    find(row.children, 'Usuń regułę ACL')!.onClick();
    expect(device.rules).toEqual([first, last]);
  });
  it('can insert at the beginning, at the end and into an empty list', () => {
    let device: Device = { ...host('router', 20), kind: 'gateway', rules: [] };
    const render = () =>
      AclEditor({
        device,
        network,
        patch: (p) => {
          device = { ...device, ...p };
        },
      });
    find(render(), 'Wstaw regułę na końcu')!.onClick();
    const original = device.rules[0];
    find(render(), 'Wstaw regułę przed pozycją 1')!.onClick();
    expect(device.rules[1]).toBe(original);
    const start = device.rules[0];
    find(render(), 'Wstaw regułę na końcu')!.onClick();
    expect(device.rules).toHaveLength(3);
    expect(device.rules.slice(0, 2)).toEqual([start, original]);
    expect(new Set(device.rules.map((r) => r.id)).size).toBe(3);
  });

  it('resets the port when selecting ANY and keeps it editable afterwards', () => {
    let device: Device = {
      ...host('router', 20),
      kind: 'gateway',
      rules: [
        { id: 'r', action: 'allow', protocol: 'TCP', port: '443', source: '*', destination: '*' },
      ],
    };
    const render = () =>
      AclEditor({
        device,
        network,
        patch: (p) => {
          device = { ...device, ...p };
        },
      });
    find(render(), 'ACL 1: protokół')!.onChange({ target: { value: 'ANY' } });
    expect(device.rules[0]).toMatchObject({ protocol: 'ANY', port: '*' });
    const port = find(render(), 'ACL 1: port')!;
    expect(port.disabled).toBe(false);
    port.onChange({ target: { value: '53' } });
    expect(device.rules[0]).toMatchObject({ protocol: 'ANY', port: '53' });
  });
  it('puts networks before device groups, sorts VLANs and device names, and preserves selected values', () => {
    const html = renderToStaticMarkup(
      <AclAddressPicker network={network} value="device:Admin" label="Cel" change={() => {}} />,
    );
    expect(html.indexOf('Całe sieci / VLAN-y')).toBeLessThan(html.indexOf('Urządzenia · VLAN'));
    expect(html.indexOf('value="vlan:20"')).toBeLessThan(html.indexOf('value="vlan:99"'));
    expect(html.indexOf('value="device:Alfa"')).toBeLessThan(html.indexOf('value="device:Zebra"'));
    expect(html).toMatch(/value="device:Admin" selected=""/);
    expect(html.indexOf('Urządzenia · VLAN 20')).toBeLessThan(html.indexOf('Urządzenia · VLAN 99'));
    expect(html.indexOf('Urządzenia · VLAN 99')).toBeLessThan(html.indexOf('Urządzenia · WAN'));
  });
  it('supports caller-owned option values for selectors outside ACL', () => {
    const html = renderToStaticMarkup(
      <DeviceOptions
        network={network}
        devices={network.devices.filter((d) => d.vlan === 20)}
        valueFor={(d) => `custom:${d.id}`}
      />,
    );
    expect(html).toContain('value="custom:Alfa"');
    expect(html).not.toContain('custom:Admin');
  });
});
