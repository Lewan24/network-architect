import { FieldHelp, fieldTips } from '../components/FieldHelp';
import { Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Device, Network, Port } from '../model/networkTypes';
import { defaultPorts, hardwareState, makePort } from '../model/ports';
import { PortFields } from './PortFields';
import { PortPanel } from '../components/PortPanel';
export function PortsEditor({
  device,
  network,
  patch,
}: {
  device: Device;
  network: Network;
  patch: (d: Partial<Device>) => void;
}) {
  const ports = device.ports || defaultPorts(device);
  const [selected, setSelected] = useState(ports[0]?.id || '');
  const port = ports.find((p) => p.id === selected);
  const hw = hardwareState(network);
  const allocation = hw.poe.get(device.id);
  function update(id: string, value: Partial<Port>) {
    patch({ ports: ports.map((p) => (p.id === id ? { ...p, ...value } : p)) });
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h3>Porty i warstwa fizyczna</h3>
          <p>Liczba i możliwości portów są konfigurowalnym profilem sprzętu.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={ports.length >= 256}
          onClick={() => {
            let index = 0;
            while (ports.some((p) => p.id === `port${index}`)) index++;
            const p = makePort(`port${index}`, 'rj45', device.vlan);
            patch({ ports: [...ports, p] });
            setSelected(p.id);
          }}
        >
          <Plus /> Dodaj port
        </button>
      </div>
      <div className="ports-layout">
        <PortPanel
          device={{ ...device, ports }}
          network={network}
          selected={selected}
          choose={(p) => setSelected(p.id)}
        />
        <div>
          {port ? (
            <>
              {device.radiusNas &&
                ['switch', 'switch-l3'].includes(device.kind) &&
                port.connector === 'rj45' && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!port.dot1x}
                      disabled={port.mode === 'trunk'}
                      onChange={(e) => update(port.id, { dot1x: e.target.checked })}
                    />
                    802.1X / RADIUS na porcie dostępowym
                  </label>
                )}
              <PortFields port={port} network={network} patch={(p) => update(port.id, p)} />
              <button
                type="button"
                className="secondary"
                disabled={
                  network.links.some(
                    (l) =>
                      (l.a === device.id && l.aPortId === port.id) ||
                      (l.b === device.id && l.bPortId === port.id),
                  ) || device.interfaces?.some((n) => n.portId === port.id)
                }
                onClick={() => {
                  patch({ ports: ports.filter((p) => p.id !== port.id) });
                  setSelected(ports.find((p) => p.id !== port.id)?.id || '');
                }}
              >
                <Trash /> Usuń nieużywany port
              </button>
            </>
          ) : (
            <p className="empty-inline">Wybierz lub dodaj port.</p>
          )}
        </div>
      </div>
      <hr />
      <h3>Budżet PoE i zapotrzebowanie</h3>
      <div className="scope-grid">
        <label className="field">
          <span>
            Łączny budżet PSE urządzenia (W) <FieldHelp topic="budget" />
          </span>
          <input
            title={fieldTips.budget}
            type="number"
            min={0}
            max={10000}
            step={0.1}
            value={device.poeBudgetWatts || 0}
            onChange={(e) => patch({ poeBudgetWatts: +e.target.value })}
          />
          <small className="field-hint">
            Alokacja {allocation?.allocated.toFixed(1) || 0} W · pozostało{' '}
            {Math.max(0, (allocation?.budget || 0) - (allocation?.allocated || 0)).toFixed(1)} W
          </small>
        </label>
        <label className="field">
          <span>Zasilanie tego urządzenia</span>
          <select
            value={device.powerSource || 'local'}
            onChange={(e) =>
              patch({
                powerSource: e.target.value as Device['powerSource'],
                powerWatts: device.powerWatts || 12,
              })
            }
          >
            <option value="local">Lokalne — dostępne</option>
            <option value="poe">Wymagane PoE z portu sąsiada</option>
          </select>
        </label>
      </div>
      {device.powerSource === 'poe' && (
        <>
          <label className="field">
            <span>
              Wymagana moc przy odbiorniku PD (W) <FieldHelp topic="power" />
            </span>
            <input
              title={fieldTips.power}
              type="number"
              min={0.1}
              max={1000}
              step={0.1}
              value={device.powerWatts || 12}
              onChange={(e) => patch({ powerWatts: +e.target.value })}
            />
          </label>
          <p className={hw.powerErrors.has(device.id) ? 'form-error' : 'info-line'}>
            {hw.powerErrors.get(device.id) ||
              'PoE przydzielone. Urządzenie może korzystać z sieci.'}
          </p>
        </>
      )}
      <p className="field-hint">
        Budżet jest rezerwowany po stronie PSE według klasy wymaganej przez pobór PD. Zasilanie
        lokalne nie modeluje jeszcze UPS-ów ani instalacji elektrycznej. Stan portu „wyłączony”
        wyłącza w tym profilu również jego PoE.
      </p>
    </section>
  );
}
