import { GearSix, ListBullets, MagnifyingGlass, Plus, SquaresFour } from '@phosphor-icons/react';
import { useState } from 'react';
import { DeviceGlyph } from '../DeviceGlyph';
import { kinds } from '../deviceCatalog';
import type { Kind, Network } from '../networkTypes';

type Props = {
  network: Network;
  selected: string | null;
  select: (id: string) => void;
  edit: (id: string) => void;
  add: (kind: Kind) => void;
  editVlans: () => void;
};
export function DeviceLibrary({
  network: net,
  selected,
  select: setSelected,
  edit: setEditing,
  add,
  editVlans,
}: Props) {
  const [query, setQuery] = useState('');
  const [palette, setPalette] = useState<'devices' | 'layers'>('devices');
  const filtered = (Object.keys(kinds) as Kind[]).filter((kind) =>
    kinds[kind].label.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')),
  );
  return (
    <aside className="library">
      <nav className="library-tabs" aria-label="Biblioteka">
        <button
          className={palette === 'devices' ? 'active' : ''}
          title="Biblioteka urządzeń"
          onClick={() => setPalette('devices')}
        >
          <SquaresFour />
          <span>Urządzenia</span>
        </button>
        <button
          className={palette === 'layers' ? 'active' : ''}
          title="Lista obiektów"
          onClick={() => setPalette('layers')}
        >
          <ListBullets />
          <span>Obiekty</span>
        </button>
      </nav>
      {palette === 'devices' ? (
        <>
          <div className="search-wrap">
            <MagnifyingGlass />
            <input
              placeholder="Szukaj urządzenia"
              aria-label="Szukaj urządzenia"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="device-library">
            {filtered.map((kind) => (
              <button
                key={kind}
                className="device-tile"
                draggable
                title={`${kinds[kind].label} — ${kinds[kind].description}. Przeciągnij na planszę lub kliknij.`}
                onDragStart={(e) => e.dataTransfer.setData('application/netweave', kind)}
                onClick={() => add(kind)}
              >
                <svg viewBox="-55 -85 110 120" aria-hidden="true">
                  <DeviceGlyph kind={kind} color={kinds[kind].color} />
                </svg>
                <strong>{kinds[kind].label}</strong>
                <Plus className="tile-add" />
              </button>
            ))}
          </div>
          {!filtered.length && <p className="library-no-results">Nie znaleziono urządzeń.</p>}
          <p className="library-tip">
            Przeciągnij na planszę.
            <br />
            Dwuklik otwiera edycję.
          </p>
        </>
      ) : (
        <div className="layer-list">
          {net.devices.map((d) => (
            <button
              key={d.id}
              className={selected === d.id ? 'active' : ''}
              onClick={() => setSelected(d.id)}
              onDoubleClick={() => setEditing(d.id)}
              title={`${d.name} · ${d.ip}`}
            >
              <i style={{ background: d.online ? kinds[d.kind].color : '#b6bdc9' }} />
              <span>
                {d.name}
                <small>{d.ip}</small>
              </span>
            </button>
          ))}
          {!net.devices.length && <p>Brak urządzeń.</p>}
        </div>
      )}
      <div className="vlan-summary">
        <div>
          <span>Sieci w projekcie</span>
          <button
            title="Zarządzaj VLAN-ami"
            aria-label="Zarządzaj VLAN-ami"
            onClick={() => editVlans()}
          >
            <GearSix />
          </button>
        </div>
        {net.vlans.map((v) => (
          <button key={v.id} onClick={() => editVlans()} title={`${v.cidr} · brama ${v.gateway}`}>
            <i style={{ background: v.color }} />
            <span>{v.name}</span>
            <b>{v.id}</b>
          </button>
        ))}
      </div>
      <div className="library-footer">
        <span className="status-dot" /> Dane tylko na tym urządzeniu
      </div>
    </aside>
  );
}
