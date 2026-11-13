import { gatewayReachable, runningServices } from '../simulation/deviceStatus';
import { cableGeometry } from './linkGeometry';
import { belongsToVlan, supportsInterfaces } from '../model/interfaces';
import { cableNames, hardwareState } from '../model/ports';
import { networkAreaPolygon } from './networkAreas';
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
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { DeviceGlyph } from '../devices/DeviceGlyph';
import { deviceCanvasScale } from './deviceSizing';
import { fitCamera, toWorld, zoomAt, type Camera, type Point } from './canvasGeometry';
import { kinds } from '../devices/deviceCatalog';
import { rackPlacement } from '../model/racks';
import { hasWan, isHypervisor, topologyLinks, tracePath, traceLinkPath } from '../model/network';
import type { Kind, Network } from '../model/networkTypes';
import {
  HOP_MS,
  START_MS,
  flightDuration,
  flightElapsed,
  flightFrame,
  type Flight,
  type TrafficLog,
} from '../simulation/simulationTiming';
export type CanvasHandle = {
  fit: () => void;
  focus: (id: string) => void;
  center: () => Point;
};
export type ContextTarget = {
  type: 'device' | 'link' | 'canvas' | 'zone' | 'text';
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
  editPorts: (id: string) => void;
  editInterfaces: (id: string) => void;
  move: (id: string, point: Point) => void;
  moveGroup: (vlanId: number, delta: Point) => void;
  addText: () => void;
  add: (kind: Kind, point: Point) => void;
  remove: () => void;
  connect: (id: string) => void;
  connection: string | null;
  connectionLabel?: string;
  cancelConnection: () => void;
  tool: Tool;
  setTool: (tool: Tool) => void;
  grid: boolean;
  context: (target: ContextTarget) => void;
  flight: Flight | null;
  active?: TrafficLog;
  hop: number;
};
function Packet({ flight, network }: { flight: Flight; network: Network }) {
  const marker = useRef<SVGGElement>(null);
  useEffect(() => {
    let frame = 0;
    const packetLinks = topologyLinks(network);
    const physicalTrace = traceLinkPath(flight.result);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = () => {
      const elapsed = flightElapsed(flight, performance.now());
      let point = reduced
        ? flight.route[
            Math.min(
              flight.route.length - 1,
              Math.max(0, Math.floor((elapsed - START_MS) / HOP_MS)),
            )
          ]
        : flightFrame(elapsed, flight.route);
      if (!reduced) {
        const hop = Math.max(
          0,
          Math.min(flight.route.length - 2, Math.floor((elapsed - START_MS) / HOP_MS)),
        );
        const a = flight.route[hop],
          b = flight.route[hop + 1];
        if (a && b) {
          const allLinks = packetLinks;
          const link = allLinks.find((l) => l.id === physicalTrace[hop]);
          const t =
            Math.abs(b.x - a.x) > Math.abs(b.y - a.y)
              ? (point.x - a.x) / (b.x - a.x || 1)
              : (point.y - a.y) / (b.y - a.y || 1);
          if (link)
            point = cableGeometry(
              link,
              link.a === a.id ? a : b,
              link.a === a.id ? b : a,
              allLinks,
            ).at(link.a === a.id ? t : 1 - t);
        }
      }
      marker.current?.setAttribute('transform', `translate(${point.x} ${point.y - 5})`);
      if (elapsed < flightDuration(flight.route.length)) frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [flight, network]);
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
export const NetworkCanvas = forwardRef<CanvasHandle, Props>(function NetworkCanvas(p, ref) {
  const allLinks = useMemo(() => topologyLinks(p.network), [p.network]);
  const hw = useMemo(() => hardwareState(p.network), [p.network]);
  const deviceStatuses = useMemo(
    () =>
      new Map(
        p.network.devices
          .filter((d) => d.kind !== 'rack')
          .map((d) => [
            d.id,
            {
              gateway: gatewayReachable(p.network, d),
              services: runningServices(d).length,
            },
          ]),
      ),
    [p.network],
  );
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
  function focusObject(id: string) {
    const link = topologyLinks(p.network).find((l) => l.id === id);
    const annotation = p.network.annotations?.find((a) => a.id === id);
    if (annotation) {
      setCamera(fitCamera([annotation], size.width, size.height));
      return;
    }
    const points = id.startsWith('zone:')
      ? p.network.devices.filter((d) => belongsToVlan(d, Number(id.slice(5))))
      : p.network.devices.filter(
          (d) => d.id === id || (link && (d.id === link.a || d.id === link.b)),
        );
    if (points.length) setCamera(fitCamera(points, size.width, size.height));
  }
  useImperativeHandle(
    ref,
    () => ({
      fit: () =>
        setCamera(
          fitCamera(
            [...p.network.devices, ...(p.network.annotations ?? [])],
            size.width,
            size.height,
          ),
        ),
      focus: focusObject,
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
        setCamera(
          fitCamera(
            [...p.network.devices, ...(p.network.annotations ?? [])],
            box.width,
            box.height,
          ),
        );
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
            const members = devices.filter((d) => belongsToVlan(d, v.id));
            if (!members.length) return null;
            const polygon = networkAreaPolygon(members);
            const top = polygon.reduce((a, b) => (a.y < b.y || (a.y === b.y && a.x < b.x) ? a : b));
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
                    p.edit(`zone:${v.id}`);
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
          {devices
            .filter((d) => d.kind === 'rack')
            .flatMap((cabinet) =>
              (cabinet.rack?.mounts || []).map((mount) => {
                const member = devices.find((d) => d.id === mount.deviceId);
                if (!member) return null;
                const visible = p.selected === cabinet.id || p.selected === member.id;
                return (
                  <g
                    key={`mount:${cabinet.id}:${member.id}`}
                    pointerEvents="none"
                    opacity={visible ? 0.85 : 0.24}
                  >
                    <title>
                      {member.name} w szafie {cabinet.name} · U{mount.startU} · {mount.heightU}U
                      (montaż)
                    </title>
                    <path
                      d={`M${cabinet.x},${cabinet.y} L${member.x},${member.y}`}
                      stroke="#9a8ab0"
                      strokeWidth={visible ? 2 : 1}
                      strokeDasharray="2 7"
                      fill="none"
                    />
                    {visible && (
                      <text
                        x={(cabinet.x + member.x) / 2}
                        y={(cabinet.y + member.y) / 2 - 10}
                        textAnchor="middle"
                        fill="#7d6a94"
                        fontSize="10"
                      >
                        Montaż · U{mount.startU} · {mount.heightU}U
                      </text>
                    )}
                  </g>
                );
              }),
            )}
          {allLinks.map((l) => {
            const a = devices.find((d) => d.id === l.a)!;
            const b = devices.find((d) => d.id === l.b)!;
            const physicalTrace = p.active ? traceLinkPath(p.active.result) : [];
            const geometry = cableGeometry(l, a, b, allLinks);
            const legacyIndex = path.findIndex(
              (id, i) => (id === l.a && path[i + 1] === l.b) || (id === l.b && path[i + 1] === l.a),
            );
            const index = physicalTrace.length ? physicalTrace.indexOf(l.id) : legacyIndex;
            const visited = index >= 0 && index < reached;
            const physical = hw.links.get(l.id);
            const linkDown = physical && !physical.up;
            const linkTitle = `${l.label || cableNames[l.cable || 'cat6']} · ${physical?.aPort?.name || l.aPortId || 'auto'} ↔ ${physical?.bPort?.name || l.bPortId || 'auto'} · ${physical?.speedMbps || 1000} Mb/s${l.lengthMeters !== undefined ? ` · ${l.lengthMeters} m` : ''}${physical?.errors.length ? ` · ${physical.errors.join(' ')}` : ''}`;
            return (
              <g
                key={l.id}
                className="network-link"
                role="button"
                tabIndex={0}
                aria-label={`Edytuj połączenie: ${a.name} ↔ ${b.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    p.edit(l.id);
                  }
                }}
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
                <title>{linkTitle}</title>
                <path d={geometry.path} stroke="transparent" strokeWidth="18" fill="none" />
                <path
                  d={geometry.path}
                  stroke={
                    linkDown
                      ? '#cc7f72'
                      : p.selected === l.id
                        ? '#6574ce'
                        : visited
                          ? '#7b89d5'
                          : '#adb9c9'
                  }
                  strokeWidth={p.selected === l.id || visited ? 2.8 : 1.6}
                  strokeDasharray={
                    l.id.startsWith('virtual:') || l.cable === 'wireless'
                      ? '4 4'
                      : linkDown || !a.online || !b.online
                        ? '5 5'
                        : undefined
                  }
                  fill="none"
                  pointerEvents="none"
                />
                {p.selected === l.id && (
                  <text
                    x={geometry.middle.x}
                    y={geometry.middle.y - 9}
                    textAnchor="middle"
                    fontSize="9"
                    fill={linkDown ? '#b76e63' : '#637791'}
                    pointerEvents="none"
                  >
                    {l.label ||
                      `${physical?.aPort?.name || 'auto'} ↔ ${physical?.bPort?.name || 'auto'}`}{' '}
                    · {physical?.speedMbps || 1000} Mb/s
                  </text>
                )}
                <circle
                  cx={geometry.middle.x}
                  cy={geometry.middle.y}
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
              const glyphScale = deviceCanvasScale[d.kind];
              const footprintScale = Math.max(0.65, glyphScale);
              const hitTop = Math.min(-95, 12 - 107 * glyphScale);
              const index = path.indexOf(d.id);
              const arrived = index >= 0 && index <= reached;
              const isStop = blocked && d.id === path.at(-1);
              const caption = d.accessSession
                ? d.accessSession.state === 'accepted'
                  ? `802.1X · ${d.accessSession.username}`
                  : 'RADIUS · odmowa dostępu'
                : d.kind === 'vm'
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
                d.kind === 'rack'
                  ? 'Monta\u017c / bez sieci'
                  : d.kind === 'switch-unmanaged'
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
                  onClick={(e) => {
                    if (p.tool === 'connect' && !spaceRef.current) {
                      e.stopPropagation();
                      p.connect(d.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (p.tool === 'connect' && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      e.stopPropagation();
                      p.connect(d.id);
                      return;
                    }
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
                    x={-Math.max(58 * footprintScale, d.name.length * 3.6)}
                    y={hitTop}
                    width={Math.max(116 * footprintScale, d.name.length * 7.2)}
                    height={83 - hitTop}
                    fill="transparent"
                  />
                  {(p.selected === d.id ||
                    p.connection === d.id ||
                    p.selected === `zone:${d.vlan}`) && (
                    <path
                      d="M-58 0 0-34 58 0 0 34Z"
                      transform={`scale(${footprintScale})`}
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
                      transform={`scale(${footprintScale})`}
                      fill="none"
                      stroke={isStop ? '#cf8465' : '#8391d8'}
                      strokeWidth="2"
                      opacity=".65"
                    />
                  )}
                  <g opacity={d.online && hw.powered.get(d.id) !== false ? 1 : 0.4}>
                    <g transform={`translate(0 12) scale(${glyphScale}) translate(0 -12)`}>
                      <DeviceGlyph kind={d.kind} color={kinds[d.kind].color} />
                    </g>
                    {d.kind !== 'rack' && (
                      <g>
                        <circle
                          cx={27 * glyphScale}
                          cy={12 - 35 * glyphScale}
                          r="5"
                          fill={deviceStatuses.get(d.id)?.gateway ? '#229954' : '#d64545'}
                        >
                          <title>Ping do bramy</title>
                        </circle>
                        {(deviceStatuses.get(d.id)?.services ?? 0) > 0 && (
                          <g transform={`translate(${22 * glyphScale} ${12 - 24 * glyphScale})`}>
                            <title>Liczba uruchomionych usług</title>
                            <rect width="74" height="20" rx="6" fill="#ffffff" stroke="#718096" />
                            <text
                              x="37"
                              y="14"
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="600"
                              fill="#172b4d"
                            >
                              Usługi: {deviceStatuses.get(d.id)?.services ?? 0}
                            </text>
                          </g>
                        )}
                      </g>
                    )}
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
                      {d.kind === 'rack'
                        ? `Szafa ${d.rack?.heightU || 42}U · ${d.rack?.mounts.length || 0} urządzeń`
                        : rackPlacement(p.network, d.id)
                          ? (() => {
                              const placement = rackPlacement(p.network, d.id)!;
                              return `${placement.cabinet.name} · U${placement.mount.startU} · ${placement.mount.heightU}U`;
                            })()
                          : hw.powerErrors.has(d.id)
                            ? 'Brak zasilania PoE'
                            : hasWan(d) && d.wanIp
                              ? `WAN ${d.wanIp}`
                              : d.interfaces && d.interfaces.length > 1
                                ? `${d.interfaces.length} interfejsy IP`
                                : caption}
                    </text>
                    <circle
                      cx={-addressLabel.length * 2.8 - 9}
                      cy="16"
                      r="2.5"
                      fill={d.online && hw.powered.get(d.id) !== false ? '#69a48c' : '#b1b7c2'}
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
          {p.flight && <Packet flight={p.flight} network={p.network} />}
          {(p.network.annotations ?? []).map((a) => {
            const point = preview?.[a.id] ?? a;
            return (
              <g
                key={a.id}
                transform={`translate(${point.x} ${point.y})`}
                className={`canvas-text ${p.selected === a.id ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Tekst: ${a.text}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.edit(a.id);
                }}
                onContextMenu={(e) => context(e, 'text', a.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    p.edit(a.id);
                  }
                  if (e.key.startsWith('Arrow')) {
                    e.preventDefault();
                    e.stopPropagation();
                    p.move(a.id, {
                      x: a.x + (e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0),
                      y: a.y + (e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0),
                    });
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || p.tool === 'pan' || spaceRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  p.select(a.id);
                  gesture.current = {
                    type: 'device',
                    pointerId: e.pointerId,
                    start: screen(e),
                    camera,
                    id: a.id,
                    original: { x: a.x, y: a.y },
                    moved: false,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
              >
                <rect
                  x={-8}
                  y={-a.fontSize}
                  width={
                    Math.max(...a.text.split('\n').map((line) => line.length), 1) *
                      a.fontSize *
                      0.75 +
                    16
                  }
                  height={a.text.split('\n').length * a.fontSize * 1.3 + 12}
                  fill="transparent"
                  pointerEvents="all"
                  stroke={p.selected === a.id ? '#a5b4fc' : 'none'}
                  strokeDasharray="5 4"
                  rx="4"
                />
                <text
                  fill={a.color}
                  fontSize={a.fontSize}
                  fontWeight="600"
                  stroke={p.selected === a.id ? '#c7d2fe' : 'white'}
                  strokeWidth="4"
                  paintOrder="stroke"
                  style={{ whiteSpace: 'pre' }}
                >
                  {a.text.split('\n').map((line, i) => (
                    <tspan key={i} x="0" dy={i ? a.fontSize * 1.3 : 0}>
                      {line || ' '}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
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
        <button onClick={p.addText} title="Dodaj tekst" aria-label="Dodaj tekst">
          <span style={{ fontSize: 18, fontWeight: 600 }}>T</span>
        </button>
      </div>
      {p.connection && (
        <div className="canvas-instruction connection-instruction">
          <span>{p.connectionLabel} → wybierz drugie urządzenie i jego port</span>
          <button onClick={p.cancelConnection} aria-label="Anuluj łączenie">
            Anuluj
          </button>
        </div>
      )}
      {p.selected && (
        <div className="selection-actions">
          <span>
            {p.selected.startsWith('zone:')
              ? `${p.network.vlans.find((v) => v.id === Number(p.selected!.slice(5)))?.name} · cała sekcja`
              : p.network.devices.find((d) => d.id === p.selected)?.name ||
                p.network.annotations?.find((a) => a.id === p.selected)?.text ||
                'Połączenie'}
          </span>
          <button onClick={() => p.edit(p.selected!)}>
            <GearSix /> Edytuj
          </button>
          <button onClick={() => focusObject(p.selected!)} aria-label="Przybliż zaznaczony obiekt">
            <ArrowsOutSimple /> Przybliż
          </button>
          {p.network.devices.some((d) => d.id === p.selected && d.kind !== 'rack') && (
            <button onClick={() => p.connect(p.selected!)}>
              <LinkSimple /> Połącz urządzenie
            </button>
          )}
          {p.network.devices.some((d) => d.id === p.selected && d.kind !== 'rack') && (
            <button onClick={() => p.editPorts(p.selected!)}>Porty i PoE</button>
          )}
          {p.network.devices.some((d) => d.id === p.selected && supportsInterfaces(d)) && (
            <button onClick={() => p.editInterfaces(p.selected!)}>Interfejsy IP</button>
          )}
          {!p.selected.startsWith('zone:') && (
            <button onClick={p.remove} aria-label="Usuń zaznaczony obiekt">
              <Trash />
            </button>
          )}
        </div>
      )}
      {!devices.length && !p.network.annotations?.length && (
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
            onClick={() =>
              setCamera(
                fitCamera([...devices, ...(p.network.annotations ?? [])], size.width, size.height),
              )
            }
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
