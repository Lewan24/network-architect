import { belongsToVlan } from '../model/interfaces';
import { SettingsSection } from '../components/SettingsSection';
import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { Check, Info, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import type { Network, Vlan } from '../model/networkTypes';
import { vlanReferences } from '../project/vlanEditing';
import { ScopeFields } from './ScopeFields';

export function VlanEditorDialog({
  vlan,
  originalId,
  network,
  save,
  remove,
  allowUsedRemoval = false,
  close,
}: {
  vlan: Vlan;
  originalId?: number;
  network: Network;
  save: (vlan: Vlan) => void;
  remove: () => void;
  allowUsedRemoval?: boolean;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(vlan));
  const [error, setError] = useState('');
  const references = originalId === undefined ? [] : vlanReferences(network, originalId);
  const locked = references.length > 0;
  function patch(value: Partial<Vlan>) {
    setDraft((v) => ({ ...v, ...value }));
    setError('');
  }
  return (
    <Modal
      title={originalId === undefined ? 'Nowa sieć / VLAN' : `Edytuj sieć · ${vlan.name}`}
      description="Adresowanie, brama, DHCP i DNS wybranej sieci"
      close={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // This dialog can be opened from inside the device's draft form through a portal.
          e.stopPropagation();
          try {
            save(draft);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="dialog-body">
          <SettingsSection
            title="1. Nazwa i adresacja"
            description="VLAN to domena L2. CIDR opisuje adresy IP — to dwie różne rzeczy."
            tone="blue"
          >
            <div className="vlan-editor-heading">
              <label className="field">
                <span>Kolor obszaru</span>
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Nazwa sieci</span>
                <input
                  autoFocus
                  required
                  maxLength={40}
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
            </div>
            <div className="vlan-fields">
              <label className="field">
                <span>
                  ID VLAN <FieldHelp topic="vlan" />
                </span>
                <input
                  title={fieldTips.vlan}
                  type="number"
                  min={1}
                  max={4094}
                  required
                  disabled={locked}
                  value={draft.id}
                  onChange={(e) => patch({ id: +e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Podsieć CIDR <FieldHelp topic="cidr" />
                </span>
                <input
                  title={fieldTips.cidr}
                  className="mono"
                  required
                  value={draft.cidr}
                  onChange={(e) => patch({ cidr: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Brama IPv4 / SVI <FieldHelp topic="gateway" />
                </span>
                <input
                  title={fieldTips.gateway}
                  className="mono"
                  required
                  value={draft.gateway}
                  onChange={(e) => patch({ gateway: e.target.value })}
                />
              </label>
            </div>
            {locked && (
              <p className="field-hint">
                Zmiana ID jest zablokowana, ponieważ sieć jest używana: {references.join(', ')}.
                Pozostałe ustawienia można edytować.
              </p>
            )}
          </SettingsSection>
          {locked && (
            <div className="vlan-removal-info">
              <strong>Urządzenia w sieci</strong>
              <p>
                {network.devices
                  .filter((d) => belongsToVlan(d, originalId!))
                  .map((d) => d.name)
                  .join(', ') || 'Odwołania w konfiguracji portów lub reguł.'}
              </p>
              <p>
                {allowUsedRemoval
                  ? 'Usunięcie wyczyści adresy i przypisania do tej sieci, wyłączy jej interfejsy i porty access/native oraz usunie zależne reguły ACL. Urządzenia i kable pozostaną na schemacie. Operację możesz cofnąć.'
                  : 'Aby usunąć zajętą sieć i wyczyścić przypisania, otwórz globalny dialog „Sieci i VLAN-y”.'}
              </p>
            </div>
          )}
          <ScopeFields vlan={draft} network={network} patch={patch} />
          <p className="info-line">
            <Info /> Zmiana podsieci wymaga zgodnych adresów statycznych. Nowe adresy automatyczne
            przydzieli osiągalny serwer DHCP.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          {originalId !== undefined && (
            <button
              type="button"
              className="secondary"
              disabled={locked && !allowUsedRemoval}
              title={
                locked && !allowUsedRemoval
                  ? 'Usuń sieć w globalnym dialogu VLAN-ów'
                  : 'Usuń sieć i wyczyść przypisania'
              }
              onClick={() => {
                try {
                  remove();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Trash /> Usuń sieć
            </button>
          )}
          <button type="button" className="secondary" onClick={close}>
            Anuluj
          </button>
          <button type="submit" className="primary">
            <Check /> Zapisz sieć
          </button>
        </footer>
      </form>
    </Modal>
  );
}
