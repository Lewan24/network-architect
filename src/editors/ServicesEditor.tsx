import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { Plus, Trash } from '@phosphor-icons/react';
import { defaultServices } from '../devices/deviceCatalog';
import type { Device, Service } from '../model/networkTypes';
export function ServicesEditor({
  device,
  patch,
}: {
  device: Device;
  patch: (p: Partial<Device>) => void;
}) {
  const services = device.services || defaultServices(device.kind);
  function update(id: string, p: Partial<Service>) {
    patch({ services: services.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Nasłuchujące usługi</h3>
          <p>Dostarczenie pakietu nie oznacza otwartego portu. Test TCP/UDP sprawdza tę listę.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            patch({
              services: [
                ...services,
                {
                  id: crypto.randomUUID(),
                  name: 'Usługa',
                  protocol: 'TCP',
                  port: 443,
                  enabled: true,
                },
              ],
            })
          }
        >
          <Plus /> Dodaj usługę
        </button>
      </div>
      {services.map((s) => (
        <div className="service-card" key={s.id}>
          <div className="service-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                aria-label="Usługa aktywna"
                checked={s.enabled}
                onChange={(e) => update(s.id, { enabled: e.target.checked })}
              />
            </label>
            <label className="field">
              <span>Nazwa usługi</span>
              <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} />
            </label>
            <label className="field">
              <span>Typ usługi</span>
              <select
                aria-label="Typ usługi"
                value={s.type ?? 'generic'}
                onChange={(e) =>
                  update(s.id, {
                    type: e.target.value as Service['type'],
                    ...(e.target.value === 'proxy' ? { protocol: 'TCP' } : {}),
                  })
                }
              >
                <option value="generic">Ogólna</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="dns">DNS</option>
                <option value="ssh">SSH</option>
                <option value="proxy">Reverse proxy</option>
              </select>
            </label>
            <label className="field">
              <span>Protokół</span>
              <select
                disabled={s.type === 'proxy'}
                value={s.protocol}
                onChange={(e) => update(s.id, { protocol: e.target.value as Service['protocol'] })}
              >
                <option>TCP</option>
                <option>UDP</option>
              </select>
            </label>
            <label className="field">
              <span>
                Port <FieldHelp topic="service" />
              </span>
              <input
                title={fieldTips.service}
                type="number"
                min={1}
                max={65535}
                value={s.port}
                onChange={(e) => update(s.id, { port: +e.target.value })}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label="Usuń usługę"
              onClick={() => patch({ services: services.filter((x) => x.id !== s.id) })}
            >
              <Trash />
            </button>
          </div>
          {s.type === 'proxy' && (
            <div className="proxy-hosts">
              <div className="section-heading">
                <div>
                  <h4>Hosty proxy</h4>
                  <p>
                    Domena Host/SNI → adres hosta i port docelowy. Połączenie z backendem jest
                    sprawdzane osobno.
                  </p>
                </div>
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    update(s.id, {
                      proxyHosts: [
                        ...(s.proxyHosts ?? []),
                        {
                          id: crypto.randomUUID(),
                          domain: '',
                          target: '',
                          port: 80,
                          enabled: true,
                        },
                      ],
                    })
                  }
                >
                  <Plus /> Dodaj host
                </button>
              </div>
              {(s.proxyHosts ?? []).map((h) => {
                const change = (p: Partial<typeof h>) =>
                  update(s.id, {
                    proxyHosts: s.proxyHosts!.map((x) => (x.id === h.id ? { ...x, ...p } : x)),
                  });
                return (
                  <div className="proxy-host-row" key={h.id}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        aria-label="Host proxy aktywny"
                        checked={h.enabled}
                        onChange={(e) => change({ enabled: e.target.checked })}
                      />
                    </label>
                    <label className="field">
                      <span>Domena</span>
                      <input
                        value={h.domain}
                        placeholder="app.example.com"
                        onChange={(e) => change({ domain: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Docelowy IPv4 lub DNS</span>
                      <input
                        value={h.target}
                        placeholder="192.168.20.10"
                        onChange={(e) => change({ target: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Port backendu</span>
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={h.port}
                        onChange={(e) => change({ port: +e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Usuń host proxy"
                      onClick={() =>
                        update(s.id, { proxyHosts: s.proxyHosts!.filter((x) => x.id !== h.id) })
                      }
                    >
                      <Trash />
                    </button>
                  </div>
                );
              })}
              {!s.proxyHosts?.length && (
                <p className="empty-inline">
                  Dodaj domenę i usługę docelową, aby proxy mogło przekazać żądanie.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
      {!services.length && (
        <p className="empty-inline">
          Żaden port TCP/UDP nie nasłuchuje. ICMP sprawdza osiągalność urządzenia.
        </p>
      )}
      <p className="field-hint">
        To deklaracja usług w modelu. Aplikacja nie uruchamia serwera HTTP, SSH ani systemu
        operacyjnego VM.
      </p>
    </section>
  );
}
