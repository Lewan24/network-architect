import { ArrowUpRight, Plus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { subnet, validateNetworkServices, validateVlans } from '../model/network';
import type { Device, Network, Vlan } from '../model/networkTypes';
import { createVlan } from '../project/vlanEditing';
import { VlanEditorDialog } from './VlanEditorDialog';

/** Shared by global network management and the device dialog's staged configuration. */
export function VlanCards({
  network,
  change,
  device,
  initialId,
}: {
  network: Network;
  change: (vlans: Vlan[]) => void;
  device?: Device;
  initialId?: number;
}) {
  const [editing, setEditing] = useState<{ vlan: Vlan; originalId?: number } | null>(null);
  const [initialVlan] = useState(() => network.vlans.find((v) => v.id === initialId));
  // Open after the containing modal has mounted, keeping the editor on top of it.
  useEffect(() => {
    if (initialVlan) setEditing({ vlan: initialVlan, originalId: initialVlan.id });
  }, [initialVlan]);
  const [error, setError] = useState('');
  const name = (id?: string) =>
    network.devices.find((d) => d.id === id)?.name || (id ? 'Urządzenie niedostępne' : 'Brak');
  function update(vlans: Vlan[]) {
    validateVlans(vlans);
    validateNetworkServices({ ...network, vlans });
    change(vlans);
    setEditing(null);
  }
  return (
    <>
      <div className="section-heading">
        <p>{network.vlans.length} sieci · wybierz kartę, aby edytować konfigurację.</p>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            try {
              setEditing({ vlan: createVlan(network, device) });
              setError('');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Plus /> Dodaj sieć
        </button>
      </div>
      <div className="vlan-cards">
        {network.vlans.map((v) => {
          const members = network.devices.filter((d) => d.vlan === v.id);
          const leased = members.filter(
            (d) =>
              d.ipMode === 'auto' &&
              d.lease &&
              d.lease.vlan === v.id &&
              d.lease.expiresAt > Date.now() &&
              d.ip,
          ).length;
          return (
            <button
              type="button"
              className="vlan-card"
              key={v.id}
              aria-label={`Edytuj ${v.name}, VLAN ${v.id}`}
              onClick={() => setEditing({ vlan: v, originalId: v.id })}
            >
              <span className="vlan-card-heading">
                <i style={{ background: v.color }} />
                <strong>{v.name}</strong>
                <b>VLAN {v.id}</b>
                <ArrowUpRight aria-hidden="true" />
              </span>
              <span className="vlan-card-cidr mono">{v.cidr}</span>
              <dl>
                <div>
                  <dt>Brama / SVI</dt>
                  <dd className="mono">{v.gateway}</dd>
                </div>
                <div>
                  <dt>Urządzenie bramy</dt>
                  <dd>{name(v.gatewayDeviceId)}</dd>
                </div>
                <div>
                  <dt>DHCP</dt>
                  <dd>{v.dhcpEnabled ? name(v.dhcpServerId) : 'Wyłączony'}</dd>
                </div>
                {v.dhcpEnabled && (
                  <div>
                    <dt>Pula DHCP</dt>
                    <dd className="mono">
                      {v.dhcpStart || 'Początek podsieci'} – {v.dhcpEnd || 'Koniec podsieci'}
                    </dd>
                  </div>
                )}
                {v.dhcpEnabled && (
                  <div>
                    <dt>Dzierżawa / relay</dt>
                    <dd>
                      {v.leaseMinutes || 120} min ·{' '}
                      {v.relayDeviceId ? name(v.relayDeviceId) : 'Bez relay'}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>DNS</dt>
                  <dd>
                    {v.dnsServerIds?.length
                      ? v.dnsServerIds.map((id) => name(id)).join(', ')
                      : 'Brak resolverów'}
                  </dd>
                </div>
              </dl>
              <span className="vlan-card-footer">
                <span>
                  {members.length} urządzeń · {members.filter((d) => d.online).length} online
                </span>
                <span>{leased} dzierżaw DHCP</span>
              </span>
            </button>
          );
        })}
      </div>
      {!network.vlans.length && (
        <p className="empty-inline">Brak sieci. Dodaj pierwszą podsieć LAN lub VLAN.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <VlanEditorDialog
          key={editing.originalId ?? 'new'}
          vlan={editing.vlan}
          originalId={editing.originalId}
          network={network}
          close={() => setEditing(null)}
          save={(vlan) => {
            const next = { ...vlan, name: vlan.name.trim(), cidr: subnet(vlan.cidr).canonical };
            update(
              editing.originalId === undefined
                ? [...network.vlans, next]
                : network.vlans.map((v) => (v.id === editing.originalId ? next : v)),
            );
          }}
          remove={() => update(network.vlans.filter((v) => v.id !== editing.originalId))}
        />
      )}
    </>
  );
}
