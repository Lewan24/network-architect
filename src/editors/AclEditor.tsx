import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { ArrowDown, ArrowUp, Info, Plus, Trash } from '@phosphor-icons/react';
import { AclAddressPicker } from './AclAddressPicker';
import type { Device, Network, Rule } from '../model/networkTypes';

export function AclEditor({
  device: d,
  patch,
  network,
}: {
  network: Network;
  device: Device;
  patch: (p: Partial<Device>) => void;
}) {
  function update(id: string, p: Partial<Rule>) {
    patch({ rules: d.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }
  function move(i: number, delta: number) {
    const rules = [...d.rules];
    [rules[i], rules[i + delta]] = [rules[i + delta], rules[i]];
    patch({ rules });
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Lista kontroli dostępu</h3>
          <p>
            Pierwsza pasująca reguła wygrywa. ACL firewalla widzi cel po DNAT i źródło przed SNAT.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() =>
            patch({
              rules: [
                ...d.rules,
                {
                  id: crypto.randomUUID(),
                  action: 'allow',
                  protocol: 'TCP',
                  port: '443',
                  source: '*',
                  destination: '*',
                },
              ],
            })
          }
        >
          <Plus /> Dodaj regułę
        </button>
      </div>
      <label className="acl-default">
        <span>
          <strong>
            Domyślna reguła ACL <FieldHelp topic="acl" />
          </strong>
          <small>Dla ruchu, który nie pasuje do żadnej reguły.</small>
        </span>
        <select
          aria-label="Domyślna reguła ACL"
          title={fieldTips.acl}
          className={(d.defaultAcl || 'deny') === 'deny' ? 'deny-select' : 'allow-select'}
          value={d.defaultAcl || 'deny'}
          onChange={(e) => patch({ defaultAcl: e.target.value as Device['defaultAcl'] })}
        >
          <option value="allow">Permit any — zezwalaj</option>
          <option value="deny">Deny any — blokuj</option>
        </select>
      </label>
      <div className="acl-rule-list">
        {d.rules.map((r, i) => (
          <article className={`acl-rule-card ${r.action}`} key={r.id}>
            <header>
              <div>
                <strong>
                  Reguła {i + 1} · {r.action === 'allow' ? 'Zezwól' : 'Blokuj'}
                </strong>
                <small>{r.id}</small>
              </div>
              <div className="rule-actions">
                <button
                  type="button"
                  disabled={!i}
                  aria-label="Reguła wyżej"
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </button>
                <button
                  type="button"
                  disabled={i === d.rules.length - 1}
                  aria-label="Reguła niżej"
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </button>
                <button
                  type="button"
                  aria-label="Usuń regułę ACL"
                  onClick={() => patch({ rules: d.rules.filter((x) => x.id !== r.id) })}
                >
                  <Trash />
                </button>
              </div>
            </header>
            <div className="acl-card-fields">
              <label className="field">
                <span>Działanie</span>
                <select
                  aria-label={`ACL ${i + 1}: działanie`}
                  className={r.action === 'deny' ? 'deny-select' : 'allow-select'}
                  value={r.action}
                  onChange={(e) => update(r.id, { action: e.target.value as Rule['action'] })}
                >
                  <option value="allow">Permit — zezwól</option>
                  <option value="deny">Deny — blokuj</option>
                </select>
              </label>
              <label className="field">
                <span>Protokół</span>
                <select
                  aria-label={`ACL ${i + 1}: protokół`}
                  value={r.protocol}
                  onChange={(e) =>
                    update(r.id, {
                      protocol: e.target.value as Rule['protocol'],
                      ...(e.target.value === 'ICMP' ? { port: '*' } : {}),
                    })
                  }
                >
                  {['ANY', 'ICMP', 'TCP', 'UDP'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>
                  Port docelowy <FieldHelp topic="aclPort" />
                </span>
                <input
                  title={fieldTips.aclPort}
                  aria-label={`ACL ${i + 1}: port`}
                  value={r.port}
                  disabled={r.protocol === 'ICMP'}
                  onChange={(e) => update(r.id, { port: e.target.value })}
                />
              </label>
              <div className="field">
                <span>Źródło / sieć</span>
                <AclAddressPicker
                  network={network}
                  label={`ACL ${i + 1}: źródło`}
                  value={r.source}
                  change={(source) => update(r.id, { source })}
                />
              </div>
              <div className="field">
                <span>Cel / sieć</span>
                <AclAddressPicker
                  network={network}
                  label={`ACL ${i + 1}: cel`}
                  value={r.destination}
                  change={(destination) => update(r.id, { destination })}
                />
              </div>
              <label className="field">
                <span>Pochodzenie testu</span>
                <select
                  aria-label={`ACL ${i + 1}: pochodzenie ruchu`}
                  value={r.ingress || 'any'}
                  onChange={(e) => update(r.id, { ingress: e.target.value as Rule['ingress'] })}
                >
                  <option value="any">Dowolne</option>
                  <option value="wan">Z internetu</option>
                  <option value="lan">Z LAN</option>
                </select>
              </label>
            </div>
          </article>
        ))}
      </div>
      {!d.rules.length && (
        <p className="empty-inline">Brak reguł szczegółowych. Decyduje domyślna reguła ACL.</p>
      )}
      <p className="info-line">
        <Info />* = dowolny adres lub port. Dla ICMP port jest pomijany. Firewall dopuszcza
        odpowiedź wcześniej dozwolonego testu. Nowe połączenia nadal podlegają ACL.
      </p>
    </section>
  );
}
