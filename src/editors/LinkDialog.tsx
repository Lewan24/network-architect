import { Check } from '@phosphor-icons/react';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import type { Link, Network } from '../model/network';
export function LinkDialog({
  link,
  network,
  close,
  save,
}: {
  link: Link;
  network: Network;
  close: () => void;
  save: (link: Link) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(link));
  return (
    <Modal
      title="Porty i połączenie"
      description={`${network.devices.find((d) => d.id === link.a)?.name} ↔ ${network.devices.find((d) => d.id === link.b)?.name}`}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(draft);
        }}
      >
        <div className="dialog-body">
          <label className="field">
            <span>Tryb obu końców połączenia</span>
            <select
              value={draft.mode || 'auto'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  mode: e.target.value as Link['mode'],
                  accessVlan: draft.accessVlan || network.vlans[0]?.id || 1,
                })
              }
            >
              <option value="auto">Automatyczny — logiczna topologia</option>
              <option value="access">Access — jeden VLAN / sieć bez tagowania</option>
              <option value="trunk">Trunk — tagowane VLAN-y</option>
            </select>
          </label>
          {draft.mode === 'access' && (
            <label className="field">
              <span>VLAN access</span>
              <select
                value={draft.accessVlan || 1}
                onChange={(e) => setDraft({ ...draft, accessVlan: +e.target.value })}
              >
                {network.vlans.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · VLAN {v.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.mode === 'trunk' && (
            <fieldset className="vlan-checks">
              <legend>Dozwolone VLAN-y — pusta lista oznacza wszystkie</legend>
              {network.vlans.map((v) => (
                <label className="checkbox-label" key={v.id}>
                  <input
                    type="checkbox"
                    checked={(draft.allowedVlans || []).includes(v.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        allowedVlans: e.target.checked
                          ? [...(draft.allowedVlans || []), v.id]
                          : (draft.allowedVlans || []).filter((id) => id !== v.id),
                      })
                    }
                  />
                  {v.name} · VLAN {v.id}
                </label>
              ))}
            </fieldset>
          )}
          <p className="field-hint">
            Model traktuje konfigurację jako zgodną na obu portach łącza. Access/trunk wpływa na
            DHCP i pakiety danych. Nie zastępuje konfiguracji interfejsów konkretnego producenta.
          </p>
        </div>
        <footer className="dialog-footer">
          <button className="secondary" type="button" onClick={close}>
            Anuluj
          </button>
          <button className="primary" type="submit">
            <Check /> Zapisz połączenie
          </button>
        </footer>
      </form>
    </Modal>
  );
}
