import { DEVICE_VIEW_BOX } from '../devices/deviceArtwork';
import {
  CaretDown,
  GearSix,
  ListBullets,
  MagnifyingGlass,
  Plus,
  SquaresFour,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { DeviceGlyph } from '../devices/DeviceGlyph';
import { deviceCategories, kinds, type DeviceCategory } from '../devices/deviceCatalog';
import { cableNames } from '../model/ports';
import type { Kind, Network } from '../model/networkTypes';

type Props = {
  network: Network;
  selected: string | null;
  select: (id: string) => void;
  edit: (id: string) => void;
  add: (kind: Kind) => void;
  editVlans: (id?: number) => void;
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
  const [collapsed, setCollapsed] = useState<Set<DeviceCategory>>(() => new Set());
  const [palette, setPalette] = useState<'devices' | 'layers'>('devices');
  const filtered = (Object.keys(kinds) as Kind[]).filter((kind) =>
    `${kinds[kind].label} ${kinds[kind].description} ${deviceCategories[kinds[kind].category]}`
      .toLocaleLowerCase('pl')
      .includes(query.trim().toLocaleLowerCase('pl')),
  );
  return (
    <aside className="library">
      <nav className="library-tabs" aria-label="Biblioteka">
        <button
          className={palette === 'devices' ? 'active' : ''}
          aria-label="Urządzenia"
          title="Biblioteka urządzeń"
          onClick={() => setPalette('devices')}
        >
          <SquaresFour />
          <span>Urządzenia</span>
        </button>
        <button
          className={palette === 'layers' ? 'active' : ''}
          aria-label="Obiekty"
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
              onChange={(e) => {
                setQuery(e.target.value);
                setCollapsed(new Set());
              }}
            />
          </div>
          <div className="device-categories">
            {(Object.keys(deviceCategories) as DeviceCategory[]).map((category) => {
              const members = filtered.filter((kind) => kinds[kind].category === category);
              if (!members.length) return null;
              const expanded = !collapsed.has(category);
              return (
                <section className="device-category" key={category}>
                  <button
                    className="device-category-toggle"
                    aria-expanded={expanded}
                    aria-controls={`category-${category}`}
                    onClick={() => {
                      setCollapsed((previous) => {
                        const next = new Set(previous);
                        if (next.has(category)) next.delete(category);
                        else next.add(category);
                        return next;
                      });
                    }}
                  >
                    <CaretDown aria-hidden="true" />
                    <span>{deviceCategories[category]}</span>
                    <small>{members.length}</small>
                  </button>
                  {expanded && (
                    <div className="device-library" id={`category-${category}`}>
                      {members.map((kind) => (
                        <button
                          key={kind}
                          className="device-tile"
                          draggable
                          title={`${kinds[kind].label} — ${kinds[kind].description}. Przeciągnij na planszę lub kliknij.`}
                          onDragStart={(e) => e.dataTransfer.setData('application/netweave', kind)}
                          onClick={() => add(kind)}
                        >
                          <svg viewBox={DEVICE_VIEW_BOX} aria-hidden="true">
                            <DeviceGlyph kind={kind} color={kinds[kind].color} />
                          </svg>
                          <strong>{kinds[kind].label}</strong>
                          <Plus className="tile-add" />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
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
          <h3>Urządzenia</h3>
          {net.devices.map((d) => (
            <button
              key={d.id}
              className={selected === d.id ? 'active' : ''}
              onClick={() => setSelected(d.id)}
              onDoubleClick={() => setEditing(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setEditing(d.id);
                }
              }}
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
          {!!net.annotations?.length && <h3>Etykiety tekstowe</h3>}
          {net.annotations?.map((a) => (
            <button
              key={a.id}
              className={selected === a.id ? 'active' : ''}
              onClick={() => setSelected(a.id)}
              onDoubleClick={() => setEditing(a.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setEditing(a.id);
                }
              }}
              title={a.text}
            >
              <i style={{ background: a.color }} />
              <span>
                {a.text}
                <small>Tekst · {a.fontSize}px</small>
              </span>
            </button>
          ))}
          <h3>Połączenia</h3>
          {net.links.map((l) => {
            const a = net.devices.find((d) => d.id === l.a);
            const b = net.devices.find((d) => d.id === l.b);
            const name = l.label || `${a?.name || l.a} ↔ ${b?.name || l.b}`;
            return (
              <button
                key={l.id}
                className={selected === l.id ? 'active' : ''}
                aria-label={`Połączenie: ${name}`}
                title={`${name} · dwuklik lub Enter: porty i kabel`}
                onClick={() => setSelected(l.id)}
                onDoubleClick={() => setEditing(l.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setEditing(l.id);
                  }
                }}
              >
                <i style={{ background: '#a1adbf' }} />
                <span>
                  {name}
                  <small>
                    {cableNames[l.cable || 'cat6']} · {l.aPortId || '?'} ↔ {l.bPortId || '?'}
                  </small>
                </span>
              </button>
            );
          })}
          {!net.links.length && <p>Brak połączeń.</p>}
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
          <button
            key={v.id}
            onClick={() => editVlans(v.id)}
            title={`${v.cidr} · brama ${v.gateway}`}
          >
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
