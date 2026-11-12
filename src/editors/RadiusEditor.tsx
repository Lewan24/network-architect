import { SettingsSection } from '../components/SettingsSection';
import { isRadiusNas, isSupplicant } from '../model/radius';
import type { Device, Network, RadiusUser } from '../model/networkTypes';

export function RadiusEditor({
  device,
  network,
  patch,
}: {
  device: Device;
  network: Network;
  patch: (value: Partial<Device>) => void;
}) {
  const servers = network.devices.filter((d) => d.kind === 'radius');
  const nasDevices = network.devices.filter(isRadiusNas);
  const radius = device.radius ?? { users: [], clients: [] };
  function updateUser(id: string, values: Partial<RadiusUser>) {
    patch({
      radius: {
        ...radius,
        users: radius.users.map((u) => (u.id === id ? { ...u, ...values } : u)),
      },
    });
  }
  return (
    <section className="radius-editor">
      <p className="info-line">
        Moduł edukacyjny AAA: używaj danych testowych. Hasła i shared secret są zapisywane jawnie w
        projekcie lokalnym i eksporcie JSON.
      </p>
      {device.kind === 'radius' && (
        <>
          <SettingsSection
            title="Użytkownicy i autoryzacja"
            description="Access-Accept wymaga zgodnego hasła, aktywnego konta i zgody na dostęp. VLAN użytkownika jest atrybutem autoryzacji."
          >
            {radius.users.map((user) => (
              <fieldset key={user.id} className="radius-entry">
                <legend>{user.username || 'Nowe konto'}</legend>
                <div className="scope-grid">
                  <label className="field">
                    <span>Login</span>
                    <input
                      maxLength={80}
                      value={user.username}
                      onChange={(e) => updateUser(user.id, { username: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                  <label className="field">
                    <span>Hasło testowe</span>
                    <input
                      type="password"
                      maxLength={128}
                      value={user.password}
                      autoComplete="new-password"
                      onChange={(e) => updateUser(user.id, { password: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Rola / opis polityki</span>
                    <input
                      maxLength={80}
                      value={user.role}
                      onChange={(e) => updateUser(user.id, { role: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Przypisywany VLAN</span>
                    <select
                      value={user.vlan ?? ''}
                      onChange={(e) =>
                        updateUser(user.id, { vlan: e.target.value ? +e.target.value : undefined })
                      }
                    >
                      <option value="">VLAN dostępu klienta</option>
                      {network.vlans.map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.name} · VLAN {v.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={user.enabled}
                    onChange={(e) => updateUser(user.id, { enabled: e.target.checked })}
                  />
                  Konto aktywne
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={user.authorized}
                    onChange={(e) => updateUser(user.id, { authorized: e.target.checked })}
                  />
                  Autoryzuj dostęp do sieci
                </label>
                <fieldset className="vlan-checks">
                  <legend>Dozwolone NAS (pusto = wszystkie zarejestrowane)</legend>
                  {nasDevices.map((n) => (
                    <label className="checkbox-label" key={n.id}>
                      <input
                        type="checkbox"
                        checked={user.allowedNasIds?.includes(n.id) ?? false}
                        onChange={(e) =>
                          updateUser(user.id, {
                            allowedNasIds: e.target.checked
                              ? [...(user.allowedNasIds || []), n.id]
                              : user.allowedNasIds?.filter((id) => id !== n.id),
                          })
                        }
                      />
                      {n.name}
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    patch({
                      radius: { ...radius, users: radius.users.filter((u) => u.id !== user.id) },
                    })
                  }
                >
                  Usuń konto
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={radius.users.length >= 256}
              onClick={() =>
                patch({
                  radius: {
                    ...radius,
                    users: [
                      ...radius.users,
                      {
                        id: crypto.randomUUID(),
                        username: '',
                        password: '',
                        role: '',
                        enabled: true,
                        authorized: true,
                      },
                    ],
                  },
                })
              }
            >
              Dodaj użytkownika
            </button>
          </SettingsSection>
          <SettingsSection
            title="Zaufane urządzenia NAS"
            description="Klientem RADIUS jest AP lub switch, nie laptop użytkownika. Sekret musi odpowiadać konfiguracji NAS."
          >
            {radius.clients.map((client, i) => (
              <div className="radius-entry" key={i}>
                <div className="scope-grid">
                  <label className="field">
                    <span>NAS</span>
                    <select
                      value={client.nasId}
                      onChange={(e) =>
                        patch({
                          radius: {
                            ...radius,
                            clients: radius.clients.map((c, index) =>
                              index === i ? { ...c, nasId: e.target.value } : c,
                            ),
                          },
                        })
                      }
                    >
                      <option value="">Wybierz AP / switch</option>
                      {nasDevices.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Shared secret</span>
                    <input
                      type="password"
                      maxLength={128}
                      autoComplete="new-password"
                      value={client.secret}
                      onChange={(e) =>
                        patch({
                          radius: {
                            ...radius,
                            clients: radius.clients.map((c, index) =>
                              index === i ? { ...c, secret: e.target.value } : c,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    patch({
                      radius: {
                        ...radius,
                        clients: radius.clients.filter((_, index) => index !== i),
                      },
                    })
                  }
                >
                  Usuń NAS
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={radius.clients.length >= 256}
              onClick={() =>
                patch({
                  radius: { ...radius, clients: [...radius.clients, { nasId: '', secret: '' }] },
                })
              }
            >
              Dodaj NAS
            </button>
          </SettingsSection>
          <SettingsSection
            title="Decyzje AAA i accounting"
            description="Ostatnie 200 zdarzeń modelu. Start potwierdza osiągalność UDP/1813; Stop opisuje zakończenie sesji w modelu."
          >
            <div className="radius-events">
              {(network.radiusEvents || [])
                .filter((e) => e.serverId === device.id)
                .slice()
                .reverse()
                .map((event, i) => (
                  <p key={i}>
                    <time>{new Date(event.time).toLocaleTimeString('pl-PL')}</time>{' '}
                    <strong>{event.type}</strong> · {event.username || 'Brak loginu'}
                    <br />
                    {event.message}
                  </p>
                ))}
            </div>
            {!network.radiusEvents?.some((e) => e.serverId === device.id) && (
              <p className="field-hint">
                Brak zdarzeń. Podłącz klienta do chronionego SSID lub portu i zapisz projekt.
              </p>
            )}
          </SettingsSection>
        </>
      )}
      {isRadiusNas(device) && (
        <SettingsSection
          title="Authenticator / NAS"
          description="NAS przekazuje logowanie do RADIUS przez UDP/1812. Jego interfejs zarządzania musi mieć dostęp do serwera przed zalogowaniem klienta."
        >
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!device.radiusNas}
              onChange={(e) =>
                patch({
                  radiusNas: e.target.checked
                    ? {
                        serverId: servers[0]?.id || '',
                        secret: '',
                        dynamicVlan: true,
                        accounting: true,
                      }
                    : undefined,
                  ...(!e.target.checked
                    ? {
                        wifiEnterprise: false,
                        ports: device.ports?.map((p) => ({ ...p, dot1x: false })),
                      }
                    : {}),
                })
              }
            />
            Skonfiguruj RADIUS dla tego NAS
          </label>
          {device.radiusNas && (
            <>
              <div className="scope-grid">
                <label className="field">
                  <span>Serwer RADIUS</span>
                  <select
                    value={device.radiusNas.serverId}
                    onChange={(e) =>
                      patch({ radiusNas: { ...device.radiusNas!, serverId: e.target.value } })
                    }
                  >
                    <option value="">Wybierz serwer</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.ip || 'DHCP'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Shared secret</span>
                  <input
                    type="password"
                    maxLength={128}
                    autoComplete="new-password"
                    value={device.radiusNas.secret}
                    onChange={(e) =>
                      patch({ radiusNas: { ...device.radiusNas!, secret: e.target.value } })
                    }
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={device.radiusNas.dynamicVlan}
                  onChange={(e) =>
                    patch({ radiusNas: { ...device.radiusNas!, dynamicVlan: e.target.checked } })
                  }
                />
                Honoruj VLAN użytkownika z Access-Accept
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={device.radiusNas.accounting}
                  onChange={(e) =>
                    patch({ radiusNas: { ...device.radiusNas!, accounting: e.target.checked } })
                  }
                />
                Accounting (UDP/1813)
              </label>
              {device.kind === 'accesspoint' ? (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!device.wifiEnterprise}
                    onChange={(e) => patch({ wifiEnterprise: e.target.checked })}
                  />
                  SSID wymaga logowania Enterprise / 802.1X
                </label>
              ) : (
                <p className="field-hint">
                  Włącz 802.1X na konkretnych portach dostępowych w zakładce Porty i PoE. Nie
                  włączaj na uplinku lub porcie serwera RADIUS.
                </p>
              )}
              <p className="field-hint">
                Uplink musi przenosić VLAN-y przyznawane użytkownikom. Brak RADIUS oznacza odmowę —
                model nie ma awaryjnego dostępu gościnnego.
              </p>
            </>
          )}
        </SettingsSection>
      )}
      {isSupplicant(device) && (
        <SettingsSection
          title="Logowanie do sieci / supplicant"
          description="Dane konta dla Enterprise Wi-Fi lub portu 802.1X. VLAN i DHCP zostaną przeliczone po zapisie konfiguracji."
        >
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!device.supplicant}
              onChange={(e) =>
                patch({ supplicant: e.target.checked ? { username: '', password: '' } : undefined })
              }
            />
            Używaj profilu logowania
          </label>
          {device.supplicant && (
            <div className="scope-grid">
              <label className="field">
                <span>Login</span>
                <input
                  maxLength={80}
                  autoComplete="off"
                  value={device.supplicant.username}
                  onChange={(e) =>
                    patch({ supplicant: { ...device.supplicant!, username: e.target.value } })
                  }
                />
              </label>
              <label className="field">
                <span>Hasło testowe</span>
                <input
                  type="password"
                  maxLength={128}
                  autoComplete="new-password"
                  value={device.supplicant.password}
                  onChange={(e) =>
                    patch({ supplicant: { ...device.supplicant!, password: e.target.value } })
                  }
                />
              </label>
            </div>
          )}
          {device.accessSession && (
            <p className="info-line">
              {device.accessSession.reason} Accounting: {device.accessSession.accounting}.
            </p>
          )}
          <p className="field-hint">
            Dla dynamicznego VLAN-u użyj DHCP. Model obsługuje jeden kontrolowany interfejs klienta;
            nie emuluje certyfikatów, PEAP/TLS, Active Directory ani MAB.
          </p>
        </SettingsSection>
      )}
    </section>
  );
}
