import type { Network, WifiPpsk } from '../model/networkTypes';

export function PpskEditor({
  keys,
  network,
  change,
  ssid,
  aaaActive = false,
}: {
  keys?: WifiPpsk[];
  network: Network;
  change: (keys: WifiPpsk[] | undefined) => void;
  ssid: string;
  aaaActive?: boolean;
}) {
  const patch = (id: string, value: Partial<WifiPpsk>) =>
    change(keys!.map((k) => (k.id === id ? { ...k, ...value } : k)));
  return (
    <fieldset className="vlan-checks ppsk-editor">
      <legend>PPSK · {ssid || 'Podstawowy SSID'}</legend>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={keys !== undefined}
          disabled={aaaActive && keys === undefined}
          onChange={(e) => change(e.target.checked ? [] : undefined)}
        />
        Różne hasła tego SSID przypisują różne VLAN-y
      </label>
      {aaaActive && (
        <p className="field-hint">
          Najpierw wyłącz globalne Wi-Fi Enterprise / MAB w zakładce RADIUS. Ten model nie łączy
          PPSK z tymi metodami na jednym AP.
        </p>
      )}
      {keys !== undefined && (
        <>
          <p className="info-line">
            Model WPA2-PPSK: klient wybiera VLAN użytym hasłem. Używaj haseł testowych — są zapisane
            jawnie w projekcie i eksporcie JSON. Wszystkie VLAN-y haseł muszą być dopuszczone na
            uplinkach AP i switchy.
          </p>
          {!keys.some((k) => k.enabled) && (
            <p className="info-line">
              Brak aktywnych haseł — ten SSID odrzuci wszystkich klientów.
            </p>
          )}
          {keys.map((k, i) => (
            <fieldset className="radius-entry" key={k.id}>
              <legend>{k.name || `Hasło ${i + 1}`}</legend>
              <div className="scope-grid">
                <label className="field">
                  <span>Nazwa profilu PPSK</span>
                  <input
                    maxLength={80}
                    value={k.name}
                    onChange={(e) => patch(k.id, { name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Hasło PPSK</span>
                  <input
                    type="password"
                    aria-label="Hasło PPSK"
                    autoComplete="new-password"
                    maxLength={64}
                    value={k.password}
                    onChange={(e) => patch(k.id, { password: e.target.value })}
                  />
                  <small className="field-hint">8–63 znaki ASCII lub 64 znaki HEX.</small>
                </label>
                <label className="field">
                  <span>VLAN po użyciu hasła</span>
                  <select value={k.vlan} onChange={(e) => patch(k.id, { vlan: +e.target.value })}>
                    {[...network.vlans]
                      .sort((a, b) => a.id - b.id)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · VLAN {v.id}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={k.enabled}
                    onChange={(e) => patch(k.id, { enabled: e.target.checked })}
                  />
                  Hasło aktywne
                </label>
              </div>
              <button type="button" onClick={() => change(keys.filter((x) => x.id !== k.id))}>
                Usuń hasło PPSK
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={!network.vlans.length || keys.length >= 128}
            onClick={() =>
              change([
                ...keys,
                {
                  id: crypto.randomUUID(),
                  name: `Profil ${keys.length + 1}`,
                  password: '',
                  vlan: network.vlans[0].id,
                  enabled: true,
                },
              ])
            }
          >
            Dodaj hasło PPSK
          </button>
          <p className="field-hint">
            Zmiana, wyłączenie lub usunięcie hasła jest sprawdzane przy kolejnym przeliczeniu sieci.
            Wyłączenie całego PPSK przywraca zwykłe przypisanie VLAN-u do SSID.
          </p>
        </>
      )}
    </fieldset>
  );
}
