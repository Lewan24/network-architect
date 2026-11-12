import { InterfacesEditor } from './InterfacesEditor';
import { PortsEditor } from './PortsEditor';
import { supportsInterfaces } from '../model/interfaces';
import { DEVICE_VIEW_BOX } from '../devices/deviceArtwork';
import { Check, GearSix, Info, Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { AclEditor } from './AclEditor';
import { DeviceGlyph } from '../devices/DeviceGlyph';
import { DnsEditor, DnsResolvers } from './DnsEditor';
import { NatEditor } from './NatEditor';
import { DeviceNetworks } from './NetworkScopes';
import { RoutingEditor } from './RoutingEditor';
import { ServicesEditor } from './ServicesEditor';
import { kinds } from '../devices/deviceCatalog';
import { dhcpStatus, reconcileDhcp } from '../model/dhcp';
import { Modal } from '../components/Modal';
import {
  hasAcl,
  hasWan,
  hostInVlan,
  isDhcpServer,
  isHypervisor,
  isRoutingDevice,
  validAclAddress,
  validIp,
  validateDeviceConfig,
  validateNetworkServices,
  validateVlans,
} from '../model/network';
import type { Device, Network, Vlan } from '../model/networkTypes';
export type DeviceTab =
  | 'ports'
  | 'interfaces'
  | 'general'
  | 'acl'
  | 'nat'
  | 'routing'
  | 'guests'
  | 'networks'
  | 'services'
  | 'dns';
type Props = {
  device: Device;
  network: Network;
  save: (device: Device, vlans?: Vlan[]) => void;
  close: () => void;
  editRelated: (id: string) => void;
  addGuest: (hostId: string) => void;
  initialTab?: DeviceTab;
};
export function DeviceDialog({
  device,
  network,
  save,
  close,
  editRelated,
  addGuest,
  initialTab = 'general',
}: Props) {
  const [draft, setDraft] = useState(() => structuredClone(device));
  const [tab, setTab] = useState<DeviceTab>(initialTab);
  const [error, setError] = useState('');
  const unmanaged = draft.kind === 'switch-unmanaged';
  const routing = isRoutingDevice(draft);
  const [draftVlans, setDraftVlans] = useState(() => structuredClone(network.vlans));
  const configNetwork = {
    ...network,
    vlans: draftVlans,
    devices: network.devices.map((d) => (d.id === draft.id ? draft : d)),
  };
  let previewNetwork = configNetwork;
  let previewError = '';
  try {
    validateVlans(draftVlans);
    previewNetwork = reconcileDhcp(configNetwork);
  } catch (e) {
    previewError = (e as Error).message;
  }
  const preview = previewNetwork.devices.find((d) => d.id === draft.id)!;
  const dhcp = previewError ? { message: previewError } : dhcpStatus(previewNetwork, preview);
  function patch(p: Partial<Device>) {
    setDraft((d) => {
      const next = { ...d, ...p };
      if (
        d.interfaces?.length &&
        p.interfaces === undefined &&
        ['ip', 'vlan', 'ipMode', 'dnsServerIds'].some((key) => key in p)
      )
        next.interfaces = d.interfaces.map((n, i) =>
          i === 0
            ? {
                ...n,
                ...(p.ip !== undefined ? { ip: p.ip } : {}),
                ...(p.vlan !== undefined ? { vlan: p.vlan } : {}),
                ...(p.ipMode !== undefined ? { ipMode: p.ipMode } : {}),
                ...('dnsServerIds' in p ? { dnsServerIds: p.dnsServerIds } : {}),
              }
            : n,
        );
      if (p.serverRole === 'hypervisor') next.interfaces = undefined;
      return next;
    });
    setError('');
  }
  const autoIp = preview.ip;
  const allocationError = '';
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!draft.name.trim()) throw Error('Podaj nazwę urządzenia.');
      if (allocationError) throw Error(allocationError);
      const ip = unmanaged ? '' : draft.ipMode === 'auto' ? autoIp : draft.ip.trim();
      if (!unmanaged && draft.ipMode === 'static' && !validIp(ip))
        throw Error('Podaj poprawny adres IPv4.');
      const vlan = draftVlans.find((v) => v.id === draft.vlan);
      if (draft.vlan && !vlan) throw Error('Wybierz istniejący VLAN.');
      if (!unmanaged && !draft.interfaces && ip && vlan && !hostInVlan(ip, vlan))
        throw Error(`Adres ${ip} nie należy do podsieci ${vlan.cidr}.`);
      if (ip && network.devices.some((d) => d.id !== draft.id && d.ip === ip))
        throw Error(`Adres ${ip} jest już zajęty.`);
      for (const [i, r] of draft.rules.entries()) {
        if (r.port !== '*' && (!/^\d+$/.test(r.port) || +r.port < 1 || +r.port > 65535))
          throw Error(`ACL ${i + 1}: podaj port 1–65535 lub *.`);
        if (!validAclAddress(r.source) || !validAclAddress(r.destination))
          throw Error(`ACL ${i + 1}: podaj poprawny IP lub *.`);
      }
      const next = {
        ...draft,
        name: draft.name.trim(),
        ip,
        ipMode: unmanaged ? ('static' as const) : draft.ipMode,
      };
      validateVlans(draftVlans);
      validateNetworkServices({
        ...configNetwork,
        devices: configNetwork.devices.map((d) => (d.id === next.id ? next : d)),
      });
      validateDeviceConfig(next, {
        ...configNetwork,
        devices: network.devices.map((d) => (d.id === next.id ? next : d)),
      });
      save(next, draftVlans);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const tabs: {
    id: DeviceTab;
    label: string;
  }[] = [
    { id: 'general', label: 'Urządzenie' },
    { id: 'ports', label: 'Porty i PoE' },
    ...(supportsInterfaces(draft) ? [{ id: 'interfaces' as const, label: 'Interfejsy IP' }] : []),
    ...(draft.kind === 'dns' || draft.dnsRecords !== undefined
      ? [{ id: 'dns' as const, label: 'Rekordy DNS' }]
      : []),
    ...(isDhcpServer(draft) ? [{ id: 'networks' as const, label: 'Sieci i DHCP' }] : []),
    ...(draft.kind !== 'internet' && draft.kind !== 'switch-unmanaged'
      ? [{ id: 'services' as const, label: 'Usługi' }]
      : []),
    ...(hasAcl(draft) ? [{ id: 'acl' as const, label: `ACL · ${draft.rules.length}` }] : []),
    ...(hasWan(draft) ? [{ id: 'nat' as const, label: 'NAT i port forwarding' }] : []),
    ...(routing ? [{ id: 'routing' as const, label: 'Routing' }] : []),
    ...(isHypervisor(draft) ? [{ id: 'guests' as const, label: 'Maszyny VM' }] : []),
  ];
  return (
    <Modal
      title={`Edytuj: ${device.name}`}
      description={kinds[draft.kind].description}
      close={close}
      wide
    >
      <form onSubmit={submit}>
        {tabs.length > 1 && (
          <nav className="dialog-tabs config-tabs" aria-label="Sekcje konfiguracji">
            {tabs.map((t) => (
              <button
                type="button"
                className={tab === t.id ? 'active' : ''}
                key={t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="dialog-body">
          {tab === 'ports' && <PortsEditor device={draft} network={configNetwork} patch={patch} />}
          {tab === 'interfaces' && (
            <InterfacesEditor
              device={draft}
              network={configNetwork}
              preview={preview}
              patch={patch}
            />
          )}
          {tab === 'general' && (
            <>
              <div
                className="device-config-shortcuts"
                aria-label="Konfiguracja sprzętu i adresacji"
              >
                <button type="button" className="secondary" onClick={() => setTab('ports')}>
                  <strong>Porty i PoE</strong>
                  <span>
                    {draft.ports?.length || 0} portów · VLAN, prędkość, moduły i zasilanie
                  </span>
                </button>
                {supportsInterfaces(draft) && (
                  <button type="button" className="secondary" onClick={() => setTab('interfaces')}>
                    <strong>Interfejsy IP</strong>
                    <span>{draft.interfaces?.length || 1} kart · adresy, DHCP, maski i bramy</span>
                  </button>
                )}
              </div>
              <div className="device-settings">
                <div className="device-preview">
                  <svg viewBox={DEVICE_VIEW_BOX}>
                    <DeviceGlyph kind={draft.kind} color={kinds[draft.kind].color} />
                  </svg>
                  <strong>{kinds[draft.kind].label}</strong>
                  <span className={`state-label ${draft.online ? '' : 'offline'}`}>
                    <i />
                    {draft.online ? 'Online' : 'Wyłączone'}
                  </span>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={draft.online}
                      onChange={(e) => patch({ online: e.target.checked })}
                    />
                    Urządzenie aktywne
                  </label>
                </div>
                <div className="device-fields">
                  <label className="field">
                    <span>Nazwa urządzenia</span>
                    <input
                      autoFocus
                      maxLength={40}
                      value={draft.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  {['gateway', 'router', 'firewall'].includes(draft.kind) && (
                    <>
                      <label className="field">
                        <span>Typ urządzenia L3</span>
                        <select
                          value={draft.kind}
                          onChange={(e) =>
                            patch({
                              kind: e.target.value as Device['kind'],
                              edgeRole: e.target.value === 'gateway' ? 'edge' : 'internal',
                              ...(e.target.value === 'gateway' ? { outboundNat: true } : {}),
                            })
                          }
                        >
                          <option value="gateway">Router / firewall — wspólny brzeg WAN</option>
                          <option value="router">Router L3</option>
                          <option value="firewall">Firewall</option>
                        </select>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={hasWan(draft)}
                          onChange={(e) =>
                            patch({ edgeRole: e.target.checked ? 'edge' : 'internal' })
                          }
                        />{' '}
                        Urządzenie brzegowe WAN / NAT
                      </label>
                      {hasWan(draft) && (
                        <label className="checkbox-label" style={{ marginTop: 10 }}>
                          <input
                            type="checkbox"
                            checked={!!draft.outboundNat}
                            onChange={(e) => patch({ outboundNat: e.target.checked })}
                          />{' '}
                          NAT wyjściowy LAN → publiczny WAN
                        </label>
                      )}
                    </>
                  )}
                  {draft.kind.startsWith('switch') && (
                    <label className="field">
                      <span>Typ przełącznika</span>
                      <select
                        value={draft.kind}
                        onChange={(e) =>
                          patch({
                            kind: e.target.value as Device['kind'],
                            ...(e.target.value !== 'switch-unmanaged' && !draft.ip
                              ? { ipMode: draft.vlan ? 'auto' : 'static' }
                              : {}),
                          })
                        }
                      >
                        <option value="switch">L2 zarządzalny · VLAN-y</option>
                        <option value="switch-unmanaged">L2 niezarządzalny · jedna sieć</option>
                        <option value="switch-l3">L3 zarządzalny · routing i ACL</option>
                      </select>
                    </label>
                  )}
                  {draft.kind === 'server' && (
                    <>
                      <label className="field">
                        <span>Rola serwera</span>
                        <select
                          value={draft.serverRole || 'server'}
                          onChange={(e) =>
                            patch({ serverRole: e.target.value as Device['serverRole'] })
                          }
                        >
                          <option value="server">Serwer aplikacji / usług</option>
                          <option value="hypervisor">Hypervisor — host maszyn VM</option>
                        </select>
                      </label>
                      {isHypervisor(draft) && (
                        <label className="field">
                          <span>Platforma wirtualizacji</span>
                          <select
                            value={draft.hypervisorVendor || 'VMware ESXi'}
                            onChange={(e) =>
                              patch({
                                hypervisorVendor: e.target.value as Device['hypervisorVendor'],
                              })
                            }
                          >
                            {['VMware ESXi', 'Proxmox VE', 'Hyper-V', 'KVM'].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  {draft.kind === 'vm' && (
                    <label className="field">
                      <span>Host wirtualizacji</span>
                      <select
                        value={draft.hostId || ''}
                        onChange={(e) => patch({ hostId: e.target.value })}
                      >
                        <option value="">Bez hosta — VM nie ma połączenia</option>
                        {network.devices.filter(isHypervisor).map((d) => (
                          <option value={d.id} key={d.id}>
                            {d.name} · {d.hypervisorVendor || 'VMware ESXi'}
                          </option>
                        ))}
                      </select>
                      <small className="field-hint">
                        Połączenie vNIC z hostem powstaje automatycznie. Host musi być aktywny, aby
                        VM mogła komunikować się z siecią.
                      </small>
                    </label>
                  )}
                  <label className="field">
                    <span>
                      {unmanaged ? 'Sieć dostępu (bez tagowania)' : 'Sieć / VLAN zarządzania'}
                    </span>
                    <select
                      value={draft.vlan}
                      onChange={(e) =>
                        patch({
                          vlan: +e.target.value,
                          ipMode: +e.target.value ? 'auto' : 'static',
                        })
                      }
                    >
                      <option value={0}>Bez VLAN-u · WAN / routing</option>
                      {network.vlans.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · VLAN {v.id} · {v.cidr}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!unmanaged ? (
                    <>
                      <label className="checkbox-label static-check">
                        <input
                          type="checkbox"
                          checked={draft.ipMode === 'static'}
                          disabled={draft.kind === 'internet'}
                          onChange={(e) => patch({ ipMode: e.target.checked ? 'static' : 'auto' })}
                        />
                        Własny statyczny adres IP
                      </label>
                      {draft.ipMode === 'static' ? (
                        <label className="field">
                          <span>Adres IPv4</span>
                          <input
                            className="mono"
                            value={draft.ip}
                            onChange={(e) => patch({ ip: e.target.value })}
                          />
                        </label>
                      ) : (
                        <div className="auto-address">
                          <span>DHCP · adres klienta</span>
                          <strong className="mono">{autoIp || 'Oczekuje na DHCP'}</strong>
                          <small>{dhcp.message}</small>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="info-line">
                      <Info />
                      Ten switch przekazuje ramki L2 w jednej sieci dostępu. Nie ma adresu IP, ACL,
                      konfiguracji trunków ani routingu.
                    </p>
                  )}
                  {draft.kind !== 'internet' && !unmanaged && (
                    <>
                      <label className="checkbox-label" style={{ marginTop: 16 }}>
                        <input
                          type="checkbox"
                          checked={draft.dnsServerIds === undefined}
                          onChange={(e) =>
                            patch({
                              dnsServerIds: e.target.checked
                                ? undefined
                                : [
                                    ...(draftVlans.find((v) => v.id === draft.vlan)?.dnsServerIds ||
                                      []),
                                  ],
                            })
                          }
                        />{' '}
                        DNS z ustawień sieci
                      </label>
                      {draft.dnsServerIds !== undefined && (
                        <DnsResolvers
                          network={configNetwork}
                          value={draft.dnsServerIds}
                          change={(dnsServerIds) => patch({ dnsServerIds })}
                        />
                      )}
                    </>
                  )}
                  {draft.kind === 'accesspoint' && (
                    <>
                      <label className="field">
                        <span>SSID sieci Wi-Fi</span>
                        <input
                          maxLength={32}
                          value={draft.ssid || ''}
                          placeholder="Biuro Wi-Fi"
                          onChange={(e) => patch({ ssid: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>VLAN klientów SSID</span>
                        <select
                          value={draft.wifiVlan ?? ''}
                          onChange={(e) =>
                            patch({ wifiVlan: e.target.value ? +e.target.value : undefined })
                          }
                        >
                          <option value="">Taki sam jak VLAN zarządzania</option>
                          {draftVlans.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} · VLAN {v.id}
                            </option>
                          ))}
                        </select>
                        <small className="field-hint">
                          AP mostkuje klientów do tej sieci bez NAT. Przy innym VLAN-ie zarządzania
                          uplink musi przenosić oba VLAN-y.
                        </small>
                      </label>
                    </>
                  )}
                  {(draft.kind === 'switch' || draft.kind === 'switch-l3') && (
                    <fieldset className="vlan-checks">
                      <legend>
                        {draft.kind === 'switch'
                          ? 'VLAN-y przenoszone przez switch L2'
                          : 'Obsługiwane VLAN-y'}
                      </legend>
                      {network.vlans.map((v) => (
                        <label className="checkbox-label" key={v.id}>
                          <input
                            type="checkbox"
                            checked={(draft.allowedVlans || []).includes(v.id)}
                            onChange={(e) =>
                              patch({
                                allowedVlans: e.target.checked
                                  ? [...(draft.allowedVlans || []), v.id]
                                  : (draft.allowedVlans || []).filter((id) => id !== v.id),
                              })
                            }
                          />
                          {v.name} <small>VLAN {v.id}</small>
                        </label>
                      ))}
                      <p className="field-hint">
                        {draft.kind === 'switch'
                          ? 'Pusta lista: wszystkie VLAN-y projektu, zgodnie z portami access/trunk. VLAN zarządzania dotyczy tylko adresu IP switcha.'
                          : 'L3 przełącza ruch w obrębie VLAN-u i routuje przez skonfigurowane interfejsy SVI. Pusta lista oznacza wszystkie VLAN-y projektu.'}
                      </p>
                    </fieldset>
                  )}
                  {hasWan(draft) && (
                    <label className="field">
                      <span>Publiczny adres WAN</span>
                      <input
                        className="mono"
                        placeholder="203.0.113.10"
                        value={draft.wanIp || ''}
                        onChange={(e) => patch({ wanIp: e.target.value })}
                      />
                      <small className="field-hint">
                        Adres wejściowy dla testów z internetu. Mapowania NAT mogą publikować
                        również dodatkowe adresy.
                      </small>
                    </label>
                  )}
                </div>
              </div>
            </>
          )}
          {tab === 'dns' && <DnsEditor device={draft} network={configNetwork} patch={patch} />}{' '}
          {tab === 'acl' && <AclEditor device={draft} network={configNetwork} patch={patch} />}
          {tab === 'networks' && (
            <DeviceNetworks
              device={draft}
              network={configNetwork}
              vlans={draftVlans}
              setVlans={setDraftVlans}
            />
          )}{' '}
          {tab === 'services' && <ServicesEditor device={draft} patch={patch} />}{' '}
          {tab === 'nat' && <NatEditor device={draft} network={configNetwork} patch={patch} />}
          {tab === 'routing' && (
            <RoutingEditor device={draft} network={configNetwork} patch={patch} />
          )}
          {tab === 'guests' && (
            <section>
              <div className="section-heading">
                <div>
                  <h3>{draft.hypervisorVendor || 'VMware ESXi'} · maszyny wirtualne</h3>
                  <p>
                    Goście używają własnych IP i VLAN-ów, niezależnych od adresu zarządzania hosta.
                  </p>
                </div>
              </div>
              <div className="guest-list">
                {network.devices
                  .filter((d) => d.kind === 'vm' && d.hostId === draft.id)
                  .map((vm) => (
                    <div key={vm.id}>
                      <DeviceGlyphPreview device={vm} />
                      <span>
                        <strong>{vm.name}</strong>
                        <small>
                          {vm.ip} · VLAN {vm.vlan} · {vm.online ? 'online' : 'wyłączona'}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        disabled={JSON.stringify(draft) !== JSON.stringify(device)}
                        onClick={() => editRelated(vm.id)}
                      >
                        <GearSix /> Edytuj VM
                      </button>
                    </div>
                  ))}
              </div>
              {!network.devices.some((d) => d.kind === 'vm' && d.hostId === draft.id) && (
                <p className="empty-inline">Ten host nie ma jeszcze maszyn wirtualnych.</p>
              )}
              <button
                type="button"
                className="secondary"
                disabled={!isHypervisor(device) || JSON.stringify(draft) !== JSON.stringify(device)}
                title="Najpierw zapisz konfigurację hosta"
                onClick={() => addGuest(draft.id)}
              >
                <Plus /> Dodaj maszynę VM
              </button>
              <p className="field-hint">
                Przed otwarciem gościa lub dodaniem VM zapisz zmiany konfiguracji hosta.
              </p>
            </section>
          )}
          {(error || allocationError) && (
            <p className="form-error" role="alert">
              {error || allocationError}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <span>Zmiany zatwierdzisz przyciskiem Zapisz.</span>
          <button className="secondary" type="button" onClick={close}>
            Anuluj
          </button>
          <button className="primary" type="submit">
            <Check /> Zapisz zmiany
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function DeviceGlyphPreview({ device }: { device: Device }) {
  return (
    <svg viewBox={DEVICE_VIEW_BOX} width="50" height="50">
      <DeviceGlyph kind={device.kind} color={kinds[device.kind].color} />
    </svg>
  );
}
