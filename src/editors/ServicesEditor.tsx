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
        <div className="service-row" key={s.id}>
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
            <span>Protokół</span>
            <select
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
