import { removeVlan } from '../project/vlanEditing';
import { Modal } from '../components/Modal';
import { applyVlans } from '../model/network';
import type { Network } from '../model/networkTypes';
import { VlanCards } from './VlanCards';

export function VlanDialog({
  network,
  save,
  close,
  initialId,
}: {
  network: Network;
  save: (network: Network) => void;
  close: () => void;
  initialId?: number;
}) {
  return (
    <Modal
      title="Sieci i VLAN-y"
      description="Podsumowanie podsieci, bram i usług adresowania"
      close={close}
      wide
    >
      <div className="dialog-body">
        <VlanCards
          network={network}
          removeUsedVlan={(id) => save(removeVlan(network, id))}
          initialId={initialId}
          change={(vlans) => save(applyVlans(network, vlans))}
        />
      </div>
      <footer className="dialog-footer">
        <span>Zmiany zapisujesz osobno w dialogu każdej sieci.</span>
        <button type="button" className="secondary" onClick={close}>
          Zamknij
        </button>
      </footer>
    </Modal>
  );
}
