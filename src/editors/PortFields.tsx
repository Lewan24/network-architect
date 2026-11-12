import type { Network, Port } from '../model/networkTypes';
import { opticProfiles, poeStandards } from '../model/ports';
export function PortFields({
  port: p,
  network,
  patch,
}: {
  port: Port;
  network: Network;
  patch: (p: Partial<Port>) => void;
}) {
  return (
    <div className="port-fields">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />{' '}
        Port włączony
      </label>
      <div className="scope-grid">
        <label className="field">
          <span>Nazwa portu</span>
          <input maxLength={80} value={p.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Gniazdo / medium</span>
          <select
            value={p.connector}
            onChange={(e) => {
              const connector = e.target.value as Port['connector'];
              patch({
                connector,
                module: undefined,
                speedMbps: undefined,
                speeds:
                  connector === 'sfp+'
                    ? [1000, 10000]
                    : connector === 'sfp'
                      ? [1000]
                      : connector === 'rj45'
                        ? [10, 100, 1000]
                        : [1000],
                poe: 'off',
              });
            }}
          >
            {['rj45', 'sfp', 'sfp+', 'wifi', 'virtual'].map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="vlan-checks">
        <legend>Obsługiwane prędkości portu (Mb/s)</legend>
        <div className="inline-checks">
          {[10, 100, 1000, 2500, 5000, 10000].map((speed) => (
            <label key={speed} className="checkbox-label">
              <input
                type="checkbox"
                checked={p.speeds.includes(speed)}
                onChange={(e) =>
                  patch({
                    speeds: e.target.checked
                      ? [...p.speeds, speed].sort((a, b) => a - b)
                      : p.speeds.filter((s) => s !== speed),
                    speedMbps: undefined,
                  })
                }
              />
              {speed}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="scope-grid">
        <label className="field">
          <span>Prędkość administracyjna</span>
          <select
            value={p.speedMbps || 0}
            onChange={(e) => patch({ speedMbps: +e.target.value || undefined })}
          >
            <option value={0}>Auto — najwyższa wspólna</option>
            {p.speeds.map((s) => (
              <option key={s} value={s}>
                {s} Mb/s
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Duplex</span>
          <select
            value={p.duplex || 'auto'}
            onChange={(e) => patch({ duplex: e.target.value as Port['duplex'] })}
          >
            <option value="auto">Auto</option>
            <option value="full">Full duplex</option>
            <option value="half">Half duplex (10/100)</option>
          </select>
        </label>
      </div>
      {(p.connector === 'sfp' || p.connector === 'sfp+') && (
        <label className="field">
          <span>Moduł optyczny (niepotrzebny dla DAC)</span>
          <select
            value={p.module || ''}
            onChange={(e) => patch({ module: (e.target.value as Port['module']) || undefined })}
          >
            <option value="">Brak modułu</option>
            {Object.entries(opticProfiles).map(([id, profile]) => (
              <option key={id} value={id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Tryb VLAN tego końca</span>
        <select value={p.mode} onChange={(e) => patch({ mode: e.target.value as Port['mode'] })}>
          <option value="auto">Automatyczny — ustawienia połączenia</option>
          <option value="access">Access — ramki nietagowane</option>
          <option value="trunk">Trunk — 802.1Q</option>
        </select>
      </label>
      {p.mode === 'access' && (
        <label className="field">
          <span>VLAN access / PVID</span>
          <input
            type="number"
            min={1}
            max={4094}
            value={p.accessVlan || 1}
            onChange={(e) => patch({ accessVlan: +e.target.value })}
          />
        </label>
      )}
      {p.mode === 'trunk' && (
        <>
          <label className="field">
            <span>Native VLAN / PVID</span>
            <input
              type="number"
              min={1}
              max={4094}
              value={p.nativeVlan || 1}
              onChange={(e) => patch({ nativeVlan: +e.target.value })}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!p.tagNative}
              onChange={(e) => patch({ tagNative: e.target.checked })}
            />{' '}
            Taguj również native VLAN przy nadawaniu
          </label>
          <fieldset className="vlan-checks">
            <legend>Allowed VLANs — pusta lista oznacza wszystkie</legend>
            {network.vlans.map((v) => (
              <label className="checkbox-label" key={v.id}>
                <input
                  type="checkbox"
                  checked={!!p.allowedVlans?.includes(v.id)}
                  onChange={(e) =>
                    patch({
                      allowedVlans: e.target.checked
                        ? [...(p.allowedVlans || []), v.id]
                        : p.allowedVlans?.filter((id) => id !== v.id),
                    })
                  }
                />
                {v.name} · {v.id}
              </label>
            ))}
          </fieldset>
        </>
      )}
      {p.connector === 'rj45' && (
        <label className="field">
          <span>PoE portu PSE — zasilanie innych urządzeń</span>
          <select
            value={p.poe || 'off'}
            onChange={(e) => patch({ poe: e.target.value as Port['poe'] })}
          >
            {Object.entries(poeStandards).map(([id, w]) => (
              <option key={id} value={id}>
                {w ? `${id.toUpperCase()} · do ${w} W PSE` : 'Wyłączone'}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
