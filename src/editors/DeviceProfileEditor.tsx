import { SettingsSection } from '../components/SettingsSection';
import type { Device } from '../model/networkTypes';

export function DeviceProfileEditor({
  device,
  patch,
}: {
  device: Device;
  patch: (value: Partial<Device>) => void;
}) {
  if (!['iot', 'laptop', 'mini-server', 'nvr', 'ups'].includes(device.kind)) return null;
  const recorder = device.recorder ?? { channels: 8, storageTb: 4, retentionDays: 30 };
  const ups = device.ups ?? {
    capacityVa: 1500,
    capacityWatts: 900,
    loadWatts: 300,
    runtimeMinutes: 15,
  };
  return (
    <SettingsSection
      title="Profil urządzenia"
      description="Parametry sprzętu i planowanie instalacji."
    >
      {['iot', 'laptop', 'mini-server'].includes(device.kind) && (
        <label className="field">
          <span>System / platforma</span>
          <input
            maxLength={80}
            value={device.platform ?? ''}
            placeholder="Np. Raspberry Pi OS, Ubuntu, Windows"
            onChange={(e) => patch({ platform: e.target.value })}
          />
        </label>
      )}
      {device.kind === 'iot' && (
        <p className="field-hint">
          SSH jest dostępne domyślnie. W zakładce Usługi dodaj np. HTTP, MQTT (TCP 1883) lub MQTT
          TLS (TCP 8883). Zasilanie PoE wymaga odpowiedniej nakładki i ustawienia poboru mocy w
          Porty i PoE.
        </p>
      )}
      {device.kind === 'nvr' && (
        <>
          {(
            [
              ['channels', 'Liczba kanałów IP', 1, 256, 1],
              ['storageTb', 'Pojemność nagrań (TB)', 0.1, 1000, 0.1],
              ['retentionDays', 'Planowana retencja (dni)', 1, 3650, 1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                required
                value={recorder[key]}
                onChange={(e) =>
                  patch({ recorder: { ...recorder, [key]: e.target.valueAsNumber } })
                }
              />
            </label>
          ))}
          <p className="field-hint">
            Parametry archiwum służą planowaniu. Dostęp do kamer sprawdzisz testem NVR → kamera, TCP
            554 (RTSP). Panel NVR udostępnia HTTPS. Rejestrator nie przekazuje ruchu między portami;
            zewnętrzny switch PoE podłącz osobno.
          </p>
        </>
      )}
      {device.kind === 'ups' && (
        <>
          {(
            [
              ['capacityVa', 'Moc pozorna (VA)', 1, 100000, 1],
              ['capacityWatts', 'Moc znamionowa (W)', 1, 100000, 1],
              ['loadWatts', 'Planowane obciążenie (W)', 0, 100000, 1],
              ['runtimeMinutes', 'Podtrzymanie przy tym obciążeniu (min)', 0, 10080, 1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                required
                value={ups[key]}
                onChange={(e) => patch({ ups: { ...ups, [key]: e.target.valueAsNumber } })}
              />
            </label>
          ))}
          <p className="info-line">
            Obciążenie: {Math.round((ups.loadWatts / ups.capacityWatts) * 100)}% mocy znamionowej.
            {ups.loadWatts > ups.capacityWatts
              ? ' Przeciążenie — wybierz większy UPS lub zmniejsz obciążenie.'
              : ''}
          </p>
          <p className="field-hint">
            Ethernet służy zarządzaniu kartą UPS (HTTPS i SNMP UDP 161). Moc i czas podtrzymania są
            parametrami planistycznymi; symulacja nie modeluje przewodów zasilania ani rozładowania
            baterii.
          </p>
        </>
      )}
    </SettingsSection>
  );
}
