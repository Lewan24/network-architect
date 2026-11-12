import { describe, expect, it } from 'vitest';
import { createDemoNetwork } from '../examples/demoNetwork';
import { diagnoseNetwork } from '../model/diagnostics';
import { simulateNetwork } from '../simulation/networkEngine';

describe('actionable project diagnostics', () => {
  it('reports an exhausted PoE budget with a consumer and a configuration action target', () => {
    const n = createDemoNetwork();
    n.devices.find((d) => d.id === 'demo-camera-switch')!.poeBudgetWatts = 0;
    const issues = diagnoseNetwork(n).filter((d) => d.code === 'poe-denied');
    expect(issues).toHaveLength(2);
    expect(issues.every((d) => d.deviceId && d.remedy.includes('budżet'))).toBe(true);
  });
  it('links a port fault directly to the faulty cable and includes its endpoint in the message', () => {
    const n = createDemoNetwork();
    const link = n.links.find((l) => l.b === 'demo-pc')!;
    n.devices.find((d) => d.id === link.a)!.ports!.find((p) => p.id === link.aPortId)!.enabled =
      false;
    const issue = diagnoseNetwork(n).find((d) => d.linkId === link.id && d.code === 'link-down')!;
    expect(issue.severity).toBe('error');
    expect(issue.message).toContain('administracyjnie');
    expect(issue.remedy).toContain('port');
  });
  it('identifies a closed service separately from a concrete ACL rule in the packet trace', () => {
    const n = createDemoNetwork();
    const blocked = simulateNetwork(n, {
      source: 'demo-guest-client',
      destination: 'demo-dns',
      protocol: 'ICMP',
      port: 0,
    });
    expect(blocked.reason).toContain('Reguła ACL');
    expect(blocked.reason).toContain('guest-private');
    const closed = simulateNetwork(n, {
      source: 'demo-pc',
      destination: 'demo-dns',
      protocol: 'TCP',
      port: 9999,
    });
    expect(closed.verdict).toBe('closed');
    expect(closed.path.at(-1)).toBe('demo-dns');
  });
  it('reports missing DHCP reachability without discarding the administrator online setting', () => {
    const n = createDemoNetwork();
    n.devices.find((d) => d.id === 'demo-firewall')!.online = false;
    const pc = n.devices.find((d) => d.id === 'demo-pc')!;
    delete pc.lease;
    pc.ip = '';
    const issue = diagnoseNetwork(n).find(
      (d) => d.code === 'dhcp-unavailable' && d.deviceId === pc.id,
    );
    expect(issue?.severity).toBe('error');
    expect(pc.online).toBe(true);
  });
  it('does not allow a disabled virtual NIC to receive data through a generated vSwitch link', () => {
    const n = createDemoNetwork();
    n.devices.find((d) => d.id === 'demo-app')!.ports![0].enabled = false;
    expect(
      simulateNetwork(n, { source: 'demo-pc', destination: 'demo-app', protocol: 'ICMP', port: 0 })
        .ok,
    ).toBe(false);
  });
});

it('reports an offline static next hop before a probe is run', () => {
  const n = createDemoNetwork();
  n.devices.find((d) => d.id === 'demo-router')!.online = false;
  const issue = diagnoseNetwork(n).find(
    (d) => d.code === 'static-next-hop' && d.deviceId === 'demo-firewall',
  );
  expect(issue?.severity).toBe('error');
  expect(issue?.message).toContain('0.0.0.0/0');
});
