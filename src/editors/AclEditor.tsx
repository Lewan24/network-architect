import { Fragment } from 'react';
import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { ArrowDown, ArrowRight, ArrowUp, Info, Plus, Trash } from '@phosphor-icons/react';
import { AclAddressPicker } from './AclAddressPicker';
import type { Device, Network, Rule } from '../model/networkTypes';

export function AclEditor({
  device: d,
  patch,
  network,
}: {
  device: Device;
  network: Network;
  patch: (p: Partial<Device>) => void;
}) {
  function update(id: string, p: Partial<Rule>) {
    patch({ rules: d.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }
  function move(i: number, delta: number) {
    const next = i + delta;
    if (next < 0 || next >= d.rules.length) return;
    const rules = [...d.rules];
    [rules[i], rules[next]] = [rules[next], rules[i]];
    patch({ rules });
  }
  function insert(index: number) {
    const rule: Rule = {
      id: crypto.randomUUID(),
      action: 'allow',
      protocol: 'TCP',
      port: '443',
      source: '*',
      destination: '*',
    };
    patch({ rules: [...d.rules.slice(0, index), rule, ...d.rules.slice(index)] });
    if (typeof window !== 'undefined')
      window.requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(`[data-acl-id="${rule.id}"]`);
        row?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: 'nearest' });
      });
  }
  function insertion(index: number) {
    return (
      <button
        type="button"
        className="acl-insert"
        aria-label={
          index === d.rules.length
            ? 'Wstaw regułę na końcu'
            : `Wstaw regułę przed pozycją ${index + 1}`
        }
        onClick={() => insert(index)}
      >
        <Plus aria-hidden="true" /> <span>Wstaw regułę tutaj</span>
      </button>
    );
  }
  return (
    <section className="acl-editor">
      <div className="section-heading acl-heading">
        <div>
          <h3>
            {d.kind === 'vm' ? 'Firewall VM — ruch przychodzący' : 'Lista kontroli dostępu'}{' '}
            <span className="acl-count">{d.rules.length}</span>
          </h3>
          <p>Od góry do dołu — pierwsza pasująca reguła rozstrzyga.</p>
        </div>
        <button className="secondary" type="button" onClick={() => insert(d.rules.length)}>
          <Plus /> Dodaj regułę
        </button>
      </div>
      <label className="acl-default">
        <span>
          <strong>
            Pozostały ruch <FieldHelp topic="acl" />
          </strong>
          <small>Gdy żadna reguła nie pasuje.</small>
        </span>
        <select
          aria-label="Domyślna reguła ACL"
          title={fieldTips.acl}
          className={
            (d.defaultAcl || (d.kind === 'vm' ? 'allow' : 'deny')) === 'deny'
              ? 'deny-select'
              : 'allow-select'
          }
          value={d.defaultAcl || (d.kind === 'vm' ? 'allow' : 'deny')}
          onChange={(e) => patch({ defaultAcl: e.target.value as Device['defaultAcl'] })}
        >
          <option value="allow">Permit any — zezwalaj</option>
          <option value="deny">Deny any — blokuj</option>
        </select>
      </label>
      <div className="acl-rule-list">
        {d.rules.map((r, i) => (
          <Fragment key={r.id}>
            {insertion(i)}
            <article
              className={`acl-rule-card ${r.action}`}
              data-acl-id={r.id}
              aria-label={`Reguła ACL ${i + 1}`}
            >
              <div className="acl-rule-controls">
                <span className="acl-order" title={`Priorytet ${i + 1}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <label className="field acl-action">
                  <span>Działanie</span>
                  <select
                    aria-label={`ACL ${i + 1}: działanie`}
                    className={r.action === 'deny' ? 'deny-select' : 'allow-select'}
                    value={r.action}
                    onChange={(e) => update(r.id, { action: e.target.value as Rule['action'] })}
                  >
                    <option value="allow">Zezwól</option>
                    <option value="deny">Blokuj</option>
                  </select>
                </label>
                <label className="field acl-protocol">
                  <span>Protokół</span>
                  <select
                    aria-label={`ACL ${i + 1}: protokół`}
                    value={r.protocol}
                    onChange={(e) =>
                      update(r.id, {
                        protocol: e.target.value as Rule['protocol'],
                        ...(['ICMP', 'ANY'].includes(e.target.value) ? { port: '*' } : {}),
                      })
                    }
                  >
                    {['ANY', 'ICMP', 'TCP', 'UDP'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="field acl-port">
                  <span>
                    Port <FieldHelp topic="aclPort" />
                  </span>
                  <input
                    title={fieldTips.aclPort}
                    aria-label={`ACL ${i + 1}: port`}
                    value={r.port}
                    disabled={r.protocol === 'ICMP'}
                    onChange={(e) => update(r.id, { port: e.target.value })}
                  />
                </label>
                <label className="field acl-ingress">
                  <span>Pochodzenie</span>
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
                <div className="rule-actions">
                  <button
                    type="button"
                    disabled={!i}
                    title="Przesuń wyżej"
                    aria-label="Reguła wyżej"
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    type="button"
                    disabled={i === d.rules.length - 1}
                    title="Przesuń niżej"
                    aria-label="Reguła niżej"
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </button>
                  <button
                    type="button"
                    title="Usuń regułę"
                    aria-label="Usuń regułę ACL"
                    onClick={() => patch({ rules: d.rules.filter((x) => x.id !== r.id) })}
                  >
                    <Trash />
                  </button>
                </div>
              </div>
              <div className="acl-rule-endpoints">
                <div className="field">
                  <span>Źródło · kto?</span>
                  <AclAddressPicker
                    network={network}
                    label={`ACL ${i + 1}: źródło`}
                    value={r.source}
                    change={(source) => update(r.id, { source })}
                  />
                </div>
                <ArrowRight className="acl-flow-arrow" aria-hidden="true" />
                <div className="field">
                  <span>Cel · do kogo?</span>
                  <AclAddressPicker
                    network={network}
                    label={`ACL ${i + 1}: cel`}
                    value={r.destination}
                    change={(destination) => update(r.id, { destination })}
                  />
                </div>
              </div>
            </article>
          </Fragment>
        ))}
        {insertion(d.rules.length)}
      </div>
      {!d.rules.length && (
        <p className="empty-inline">
          Brak reguł szczegółowych. Obowiązuje ustawienie „Pozostały ruch”.
        </p>
      )}
      <p className="info-line acl-footnote">
        <Info />
        <span>
          * = dowolny adres lub port. ICMP nie używa portów. Odpowiedzi dozwolonego testu są
          dopuszczane przez firewall. Przy NAT reguły widzą cel po DNAT i źródło przed SNAT.
        </span>
      </p>
    </section>
  );
}
