import {
  ArrowsOutSimple,
  Cursor,
  GearSix,
  Hand,
  LinkSimple,
  Minus,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { DeviceGlyph } from './DeviceGlyph';
import { fitCamera, toWorld, zoomAt, type Camera, type Point } from './canvasGeometry';
import { kinds } from './deviceCatalog';
import { hasWan, isHypervisor, topologyLinks, tracePath } from './network';
import type { Kind, Network } from './networkTypes';
import {
  HOP_MS,
  START_MS,
  flightDuration,
  flightElapsed,
  flightFrame,
  type Flight,
  type TrafficLog,
} from './simulationTiming';
export type CanvasHandle = {
  fit: () => void;
  center: () => Point;
};
export type ContextTarget = {
  type: 'device' | 'link' | 'canvas' | 'zone';
  id?: string;
  screen: Point;
  world: Point;
};
export type Tool = 'select' | 'pan' | 'connect';
type Props = {
  network: Network;
  selected: string | null;
  select: (id: string | null) => void;
  edit: (id: string) => void;
  move: (id: string, point: Point) => void;
  moveGroup: (vlanId: number, delta: Point) => void;
  add: (kind: Kind, point: Point) => void;
  remove: () => void;
  connect: (id: string) => void;
  connection: string | null;
  tool: Tool;
  setTool: (tool: Tool) => void;
  grid: boolean;
  context: (target: ContextTarget) => void;
  flight: Flight | null;
  active?: TrafficLog;
  hop: number;
};
function Packet({ flight }: { flight: Flight }) {
  const marker = useRef<SVGGElement>(null);
  useEffect(() => {
    let frame = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = () => {
      const elapsed = flightElapsed(flight, performance.now());
      const point = reduced
        ? flight.route[
            Math.min(
              flight.route.length - 1,
              Math.max(0, Math.floor((elapsed - START_MS) / HOP_MS)),
            )
          ]
        : flightFrame(elapsed, flight.route);
      marker.current?.setAttribute('transform', `translate(${point.x} ${point.y - 5})`);
      if (elapsed < flightDuration(flight.route.length)) frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [flight]);
  const first = flight.route[0];
  return (
    first && (
      <g
        ref={marker}
        transform={`translate(${first.x} ${first.y - 5})`}
        pointerEvents="none"
        className="packet-marker"
      >
        <circle r="12" fill="#6577d9" opacity=".14" />
        <circle r="5.5" fill="#6577d9" stroke="white" strokeWidth="2" />
        <path d="M-2-1.5 0 1.5 3-2" stroke="white" strokeWidth="1" fill="none" />
      </g>
    )
  );
}
function hull(points: Point[]) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: Point[]) => {
    const out: Point[] = [];
    for (const p of items) {
      while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
export const NetworkCanvas = forwardRef<CanvasHandle, Props>(function NetworkCanvas(p, ref) {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const firstFit = useRef(false);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [space, setSpace] = useState(false);
  const previousSize = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const [preview, setPreview] = useState<Record<string, Point> | null>(null);
  const previewRef = useRef<typeof preview>(null);
  const gesture = useRef<{
    type: 'pan' | 'device' | 'group';
    pointerId: number;
    start: Point;
    camera: Camera;
    id?: string;
    original?: Point;
    groupId?: number;
    members?: {
      id: string;
      x: number;
      y: number;
    }[];
    moved: boolean;
  } | null>(null);
  const spaceRef = useRef(false);
  useImperativeHandle(
    ref,
    () => ({
      fit: () => setCamera(fitCamera(p.network.devices, size.width, size.height)),
      center: () => toWorld({ x: size.width / 2, y: size.height / 2 }, camera),
    }),
    [p.network.devices, size, camera],
  );
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ width: box.width, height: box.height });
      if (!firstFit.current && box.width > 100 && box.height > 100) {
        firstFit.current = true;
        setCamera(fitCamera(p.network.devices, box.width, box.height));
      } else if (previousSize.current) {
        const old = previousSize.current;
        setCamera((c) => ({
          ...c,
          x: c.x + (box.width - old.width) / 2,
          y: c.y + (box.height - old.height) / 2,
        }));
      }
      previousSize.current = { width: box.width, height: box.height };
    });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = node.getBoundingClientRect();
      const anchor = { x: e.clientX - box.left, y: e.clientY - box.top };
      setCamera((c) =>
        e.shiftKey
          ? { ...c, x: c.x - e.deltaY, y: c.y - e.deltaX }
          : zoomAt(c, anchor, c.zoom * Math.exp(-e.deltaY * 0.0015)),
      );
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea,dialog,[contenteditable]'))
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        spaceRef.current = true;
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setSpace(false);
      }
    };
    const blur = () => {
      spaceRef.current = false;
      setSpace(false);
      gesture.current = null;
      setPreview(null);
      previewRef.current = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  function screen(e: { clientX: number; clientY: number }) {
    const box = svg.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }
  function context(e: React.MouseEvent, type: ContextTarget['type'], id?: string) {
    e.preventDefault();
    e.stopPropagation();
    if (id) p.select(id);
    p.context({
      type,
      id,
      screen: { x: e.clientX, y: e.clientY },
      world: toWorld(screen(e), camera),
    });
  }
  function finish(cancelled = false) {
    const g = gesture.current;
    const preview = previewRef.current;
    if (g?.type === 'device' && g.moved && preview?.[g.id!] && !cancelled) {
      const point = preview[g.id!];
      p.move(g.id!, { x: Math.round(point.x / 10) * 10, y: Math.round(point.y / 10) * 10 });
    }
    if (g?.type === 'group' && g.moved && preview && !cancelled && g.members?.length) {
      const first = g.members[0];
      const point = preview[first.id];
      if (point)
        p.moveGroup(g.groupId!, {
          x: Math.round((point.x - first.x) / 10) * 10,
          y: Math.round((point.y - first.y) / 10) * 10,
        });
    }
    gesture.current = null;
    previewRef.current = null;
    setPreview(null);
  }
  const devices = p.network.devices.map((d) => (preview?.[d.id] ? { ...d, ...preview[d.id] } : d));
  const path = p.active?.status !== 'cancelled' ? (p.active ? tracePath(p.active.result) : []) : [];
  const reached =
    p.flight?.id === p.active?.id
      ? p.hop
      : p.active?.status === 'complete'
        ? Math.max(0, path.length - 1)
        : -1;
  const complete = p.active?.status === 'complete';
  const blocked = complete && !p.active?.result.ok;
  return (
    <div
      ref={host}
      className={`canvas-area ${p.tool === 'pan' || space ? 'hand-mode' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const kind = e.dataTransfer.getData('application/netweave');
        if (Object.hasOwn(kinds, kind)) p.add(kind as Kind, toWorld(screen(e), camera));
      }}
    >
      <svg
        ref={svg}
        className={`network-canvas ${p.tool}`}
        aria-label="Izometryczna topologia sieci. Dwuklik edytuje urządzenie, przeciągnięcie tła przesuwa widok."
        onContextMenu={(e) => context(e, 'canvas')}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          e.preventDefault();
          if (e.button === 0 && !spaceRef.current && p.tool !== 'pan') p.select(null);
          gesture.current = {
            type: 'pan',
            pointerId: e.pointerId,
            start: screen(e),
            camera,
            moved: false,
          };
          svg.current!.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.pointerId !== e.pointerId) return;
          const point = screen(e);
          const dx = point.x - g.start.x;
          const dy = point.y - g.start.y;
          if (!g.moved && Math.hypot(dx, dy) < 4) return;
          g.moved = true;
          if (g.type === 'pan') setCamera({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
          else {
            const next: Record<string, Point> =
              g.type === 'group'
                ? Object.fromEntries(
                    g.members!.map((d) => [
                      d.id,
                      { x: d.x + dx / g.camera.zoom, y: d.y + dy / g.camera.zoom },
                    ]),
                  )
                : {
                    [g.id!]: {
                      x: g.original!.x + dx / g.camera.zoom,
                      y: g.original!.y + dy / g.camera.zoom,
                    },
                  };
            previewRef.current = next;
            setPreview(next);
          }
        }}
        onPointerUp={() => finish()}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => {
          if (gesture.current) finish(true);
        }}
      >
        <defs>
          <pattern
            id="iso-grid"
            width={64 * camera.zoom}
            height={36 * camera.zoom}
            x={camera.x}
            y={camera.y}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M0 0 ${64 * camera.zoom} ${36 * camera.zoom}M${64 * camera.zoom} 0 0 ${36 * camera.zoom}`}
              fill="none"
              stroke="#e2e7ee"
              strokeWidth=".6"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={p.grid ? 'url(#iso-grid)' : '#fafbfd'} />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {p.network.vlans.map((v) => {
            const members = devices.filter((d) => d.vlan === v.id);
            if (!members.length) return null;
            const polygon = hull(
              members.flatMap((d) => [
                { x: d.x - 85, y: d.y },
                { x: d.x, y: d.y - 90 },
                { x: d.x + 85, y: d.y },
                { x: d.x, y: d.y + 85 },
              ]),
            );
            const top = polygon.reduce((a, b) => (a.y < b.y ? a : b));
            const selected = p.selected === `zone:${v.id}`;
            return (
              <g
                key={v.id}
                className={`network-zone ${selected ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Sekcja ${v.name}, VLAN ${v.id}, ${members.length} urządzeń. Przeciągnij, aby przenieść grupę.`}
                aria-pressed={selected}
                onPointerDown={(e) => {
                  if (e.button !== 0 || p.tool !== 'select' || spaceRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  p.select(`zone:${v.id}`);
                  gesture.current = {
                    type: 'group',
                    pointerId: e.pointerId,
                    start: screen(e),
                    camera,
                    groupId: v.id,
                    members: members.map((d) => ({ id: d.id, x: d.x, y: d.y })),
                    moved: false,
                  };
                  svg.current!.setPointerCapture(e.pointerId);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.edit(`zone:${v.id}`);
                }}
                onContextMenu={(e) => context(e, 'zone', `zone:${v.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    p.select(`zone:${v.id}`);
                  }
                  if (e.key.startsWith('Arrow')) {
                    e.preventDefault();
                    p.select(`zone:${v.id}`);
                    p.moveGroup(v.id, {
                      x: e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0,
                      y: e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0,
                    });
                  }
                }}
              >
                <polygon
                  points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={v.color}
                  fillOpacity={selected ? 0.2 : 0.12}
                  stroke={selected ? '#6575ca' : v.color}
                  strokeOpacity=".85"
                  strokeWidth={selected ? 2.5 : 1.7}
                  strokeDasharray="7 4"
                />
                <g transform={`translate(${top.x - 70} ${top.y - 37})`}>
                  <rect
                    width={Math.max(195, Math.min(340, v.name.length * 6 + 95))}
                    height="34"
                    rx="5"
                    fill={selected ? '#f1f3ff' : '#fff'}
                    stroke={selected ? '#6575ca' : v.color}
                    strokeWidth="1.2"
                  />
                  <rect x="5" y="7" width="4" height="20" rx="2" fill={v.color} />
                  <text x="17" y="13" fill={v.color} className="zone-label">
                    {v.name} · VLAN {v.id}
                  </text>
                  <text x="17" y="26" fill="#687c97" fontSize="8">
                    {v.cidr} · {members.length} urządzeń · przeciągnij grupę
                  </text>
                </g>
              </g>
            );
          })}
          {topologyLinks(p.network).map((l) => {
            const a = devices.find((d) => d.id === l.a)!;
            const b = devices.find((d) => d.id === l.b)!;
            const index = path.findIndex(
              (id, i) => (id === l.a && path[i + 1] === l.b) || (id === l.b && path[i + 1] === l.a),
            );
            const visited = index >= 0 && index < reached;
            return (
              <g
                key={l.id}
                className="network-link"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.edit(l.id);
                }}
                onContextMenu={(e) => context(e, 'link', l.id)}
                onPointerDown={(e) => {
                  if (e.button === 0 && p.tool !== 'pan' && !spaceRef.current) {
                    e.stopPropagation();
                    p.select(l.id);
                  }
                }}
              >
                <path
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  stroke="transparent"
                  strokeWidth="18"
                  fill="none"
                />
                <path
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  stroke={p.selected === l.id ? '#6574ce' : visited ? '#7b89d5' : '#adb9c9'}
                  strokeWidth={p.selected === l.id || visited ? 2.8 : 1.6}
                  strokeDasharray={
                    l.id.startsWith('virtual:') ? '4 4' : !a.online || !b.online ? '5 5' : undefined
                  }
                  fill="none"
                  pointerEvents="none"
                />
                <circle
                  cx={(a.x + b.x) / 2}
                  cy={(a.y + b.y) / 2}
                  r="2.5"
                  fill="white"
                  stroke={visited ? '#7b89d5' : '#adb9c9'}
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {devices
            .slice()
            .sort((a, b) => a.y - b.y)
            .map((d) => {
              const index = path.indexOf(d.id);
              const arrived = index >= 0 && index <= reached;
              const isStop = blocked && d.id === path.at(-1);
              const caption =
                d.kind === 'vm'
                  ? 'VM · ' +
                    (p.network.devices.find((h) => h.id === d.hostId)?.name || 'bez hosta')
                  : isHypervisor(d)
                    ? d.hypervisorVendor || 'Hypervisor'
                    : d.kind === 'switch-l3'
                      ? 'L3 · routing'
                      : d.kind === 'switch-unmanaged'
                        ? 'L2 · niezarządzalny'
                        : d.kind === 'switch'
                          ? 'L2 · zarządzalny'
                          : d.kind === 'accesspoint'
                            ? d.ssid || 'Wi-Fi'
                            : '';
              const addressLabel =
                d.kind === 'switch-unmanaged'
                  ? 'Bez IP zarządzania'
                  : `${d.ip || 'Czeka na adres'} · ${d.ipMode === 'auto' ? 'DHCP' : 'STATIC'}`;
              return (
                <g
                  key={d.id}
                  transform={`translate(${d.x} ${d.y})`}
                  className="network-device"
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.name}, ${d.ip}, dwuklik lub Enter, aby edytować`}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (p.tool === 'select') p.edit(d.id);
                  }}
                  onContextMenu={(e) => context(e, 'device', d.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      p.edit(d.id);
                    }
                    if (e.key.startsWith('Arrow')) {
                      e.preventDefault();
                      p.move(d.id, {
                        x: d.x + (e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0),
                        y: d.y + (e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0),
                      });
                    }
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || p.tool === 'pan' || spaceRef.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                    p.select(d.id);
                    if (p.tool === 'connect') {
                      p.connect(d.id);
                      return;
                    }
                    gesture.current = {
                      type: 'device',
                      pointerId: e.pointerId,
                      start: screen(e),
                      camera,
                      id: d.id,
                      original: { x: d.x, y: d.y },
                      moved: false,
                    };
                    svg.current!.setPointerCapture(e.pointerId);
                  }}
                >
                  <rect
                    x={-Math.max(58, d.name.length * 3.6)}
                    y="-95"
                    width={Math.max(116, d.name.length * 7.2)}
                    height="178"
                    fill="transparent"
                  />
                  {(p.selected === d.id ||
                    p.connection === d.id ||
                    p.selected === `zone:${d.vlan}`) && (
                    <path
                      d="M-58 0 0-34 58 0 0 34Z"
                      fill="#edf0ff"
                      stroke="#7c8ce1"
                      strokeWidth="1.5"
                    />
                  )}
                  {arrived && (
                    <ellipse
                      className={p.flight && index === reached ? 'hop-ring' : ''}
                      cy="2"
                      rx="49"
                      ry="28"
                      fill="none"
                      stroke={isStop ? '#cf8465' : '#8391d8'}
                      strokeWidth="2"
                      opacity=".65"
                    />
                  )}
                  <g opacity={d.online ? 1 : 0.4}>
                    <DeviceGlyph kind={d.kind} color={kinds[d.kind].color} />
                  </g>
                  <g transform="translate(0 44)" pointerEvents="none">
                    <rect
                      x={-Math.max(52, d.name.length * 3.6)}
                      y="-12"
                      width={Math.max(104, d.name.length * 7.2)}
                      height="23"
                      rx="4"
                      fill="#fafbfd"
                      fillOpacity=".96"
                    />
                    <text textAnchor="middle" className="device-name">
                      {d.name}
                    </text>
                    <text textAnchor="middle" y="20" className="device-ip">
                      {addressLabel}
                    </text>
                    <text textAnchor="middle" y="35" className="device-role">
                      {hasWan(d) && d.wanIp ? `WAN ${d.wanIp}` : caption}
                    </text>
                    <circle
                      cx={-addressLabel.length * 2.8 - 9}
                      cy="16"
                      r="2.5"
                      fill={d.online ? '#69a48c' : '#b1b7c2'}
                    />
                  </g>
                  {isStop && (
                    <g transform="translate(37 -40)">
                      <circle r="10" fill="#cb8367" />
                      <path d="m-3-3 6 6m0-6-6 6" stroke="white" strokeWidth="1.5" />
                    </g>
                  )}
                </g>
              );
            })}
          {p.flight && <Packet flight={p.flight} />}
        </g>
      </svg>
      <div className="floating-tools">
        <button
          className={p.tool === 'select' ? 'active' : ''}
          title="Wybierz (V)"
          aria-label="Wybierz"
          onClick={() => p.setTool('select')}
        >
          <Cursor />
        </button>
        <button
          className={p.tool === 'pan' ? 'active' : ''}
          title="Przesuwaj planszę (H)"
          aria-label="Przesuwaj planszę"
          onClick={() => p.setTool('pan')}
        >
          <Hand />
        </button>
        <button
          className={p.tool === 'connect' ? 'active' : ''}
          title="Połącz urządzenia (C)"
          aria-label="Połącz urządzenia"
          onClick={() => p.setTool('connect')}
        >
          <LinkSimple />
        </button>
      </div>
      {p.connection && (
        <div className="canvas-instruction">Wybierz drugie urządzenie · Esc anuluje</div>
      )}
      {p.selected && (
        <div className="selection-actions">
          <span>
            {p.selected.startsWith('zone:')
              ? `${p.network.vlans.find((v) => v.id === Number(p.selected!.slice(5)))?.name} · cała sekcja`
              : p.network.devices.find((d) => d.id === p.selected)?.name || 'Połączenie'}
          </span>
          <button onClick={() => p.edit(p.selected!)}>
            <GearSix /> Edytuj
          </button>
          {!p.selected.startsWith('zone:') && (
            <button onClick={p.remove} aria-label="Usuń zaznaczony obiekt">
              <Trash />
            </button>
          )}
        </div>
      )}
      {!devices.length && (
        <div className="canvas-empty">
          <SquaresEmpty />
          <h2>Tu zaczyna się Twoja sieć</h2>
          <p>Przeciągnij urządzenie z biblioteki lub kliknij planszę prawym przyciskiem.</p>
        </div>
      )}
      <div className="canvas-footer">
        <span className="canvas-navigation-hint">
          <kbd>Spacja</kbd> + przeciągnij · Kółko: zoom · Dwuklik: edycja
        </span>
        <div className="zoom-controls">
          <button
            aria-label="Oddal"
            onClick={() =>
              setCamera((c) => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, c.zoom / 1.2))
            }
          >
            <Minus />
          </button>
          <span>{Math.round(camera.zoom * 100)}%</span>
          <button
            aria-label="Przybliż"
            onClick={() =>
              setCamera((c) => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, c.zoom * 1.2))
            }
          >
            <Plus />
          </button>
          <i />
          <button
            title="Dopasuj do sieci (F)"
            aria-label="Dopasuj widok do sieci"
            onClick={() => setCamera(fitCamera(devices, size.width, size.height))}
          >
            <ArrowsOutSimple />
          </button>
        </div>
      </div>
    </div>
  );
});
function SquaresEmpty() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M4 24 24 12 44 24 24 36ZM24 12V2M4 24v12l20 12 20-12V24M24 36v12" />
    </svg>
  );
}
