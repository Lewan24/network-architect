import { createPortConnection } from '../model/portConnections';
import { PortConnectionDialog } from '../editors/PortConnectionDialog';
import { DiagnosticsDialog } from '../components/DiagnosticsDialog';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOutSimple,
  CheckCircle,
  Copy,
  DownloadSimple,
  GearSix,
  Info,
  LinkSimple,
  Network as NetworkIcon,
  Play,
  Power,
  Question,
  SquaresFour,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContextMenu, MenuItem } from '../components/ContextMenu';
import { DeviceLibrary } from '../components/DeviceLibrary';
import { HelpDialog } from '../components/HelpDialog';
import { DeviceDialog, type DeviceTab } from '../editors/DeviceDialog';
import { reconcileDhcp } from '../model/dhcp';
import { VlanDialog } from '../editors/VlanDialog';
import { ExampleMenu } from '../examples/ExampleMenu';
import { blankProject } from '../model/internetModel';
import { LinkDialog } from '../editors/LinkDialog';
import { hasWan, isHypervisor, parseNetwork, topologyLinks } from '../model/network';
import {
  NetworkCanvas,
  type CanvasHandle,
  type ContextTarget,
  type Tool,
} from '../canvas/NetworkCanvas';
import { moveNetworkGroup } from '../canvas/networkGroups';
import type { Kind, Network, Probe, Port, Cable } from '../model/networkTypes';
import {
  createGuestDevice,
  createNetworkDevice,
  duplicateNetworkDevice,
  removeNetworkObject,
} from '../project/projectActions';
import { TrafficPanel } from '../simulation/SimulationPanel';
import { useProject } from '../project/useProject';
import { useSimulation } from '../simulation/useSimulation';
export function App() {
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  const project = useProject(notify);
  const { network: net, past, future, saved } = project;
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [connection, setConnection] = useState<string | null>(null);
  const [connectionPort, setConnectionPort] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [portPicker, setPortPicker] = useState<{ deviceId: string; target: boolean } | null>(null);
  const [simulation, setSimulation] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingTab, setEditingTab] = useState<DeviceTab>('general');
  const [vlansOpen, setVlansOpen] = useState<number | 'all' | null>(null);
  const [help, setHelp] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [context, setContext] = useState<ContextTarget | null>(null);
  const [grid, setGrid] = useState(true);
  const [probe, setProbe] = useState<Probe>(() => ({
    source: net.devices.find((d) => d.kind === 'workstation')?.id || net.devices[0]?.id || '',
    destination: net.devices.find((d) => d.kind === 'server')?.id || net.devices.at(-1)?.id || '',
    protocol: 'ICMP',
    port: 443,
    checkReply: true,
  }));
  const canvas = useRef<CanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);

  const sim = useSimulation(net, notify);
  const editDevice = net.devices.find((d) => d.id === editing);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const linkForEdit = net.links.find((l) => l.id === editingLink);
  const connectionDevice = net.devices.find((d) => d.id === connection);
  const connectionSocket = connectionDevice?.ports?.find((p) => p.id === connectionPort);
  const pickingDevice = net.devices.find((d) => d.id === portPicker?.deviceId);
  useEffect(() => {
    if (!connection) {
      setConnectionPort(null);
      setPortPicker(null);
    } else if (!connectionDevice || (connectionPort && !connectionSocket)) cancelConnection();
  }, [connection, connectionPort, connectionDevice, connectionSocket]);
  function openEditor(id: string, section: DeviceTab = 'general') {
    setEditingTab(section);
    if (id.startsWith('zone:')) setVlansOpen(Number(id.slice(5)));
    else if (id.startsWith('virtual:')) setEditing(id.slice(8));
    else if (net.links.some((l) => l.id === id)) setEditingLink(id);
    else setEditing(id);
  }
  function commit(next: Network) {
    sim.invalidate();
    project.commit(next);
    setContext(null);
  }
  function replaceProject(next: Network) {
    commit(next);
    sim.clear();
    setSelected(null);
    cancelConnection();
    setSimulation(false);
    setEditing(null);
    setEditingLink(null);
    setProbe({
      source: next.devices.find((d) => d.kind === 'internet')?.id || '',
      destination: next.devices.find((d) => hasWan(d))?.wanIp || '',
      protocol: 'TCP',
      port: 443,
      checkReply: true,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.current?.fit()));
  }
  function undo() {
    if (!past.length) return;
    sim.invalidate();
    project.undo();
    setSelected(null);
    setConnection(null);
  }
  function redo() {
    if (!future.length) return;
    sim.invalidate();
    project.redo();
    setSelected(null);
    setConnection(null);
  }
  function remove(id = selected) {
    if (!id) return;
    if (id.startsWith('zone:')) {
      setSelected(null);
      return;
    }
    if (net.devices.some((d) => d.id === id && d.kind === 'internet')) {
      notify('Internet jest domyślnym źródłem. Możesz go wyłączyć lub odłączyć od brzegu.');
      return;
    }
    commit(removeNetworkObject(net, id));
    setSelected(null);
    if (connection === id) setConnection(null);
  }
  function add(kind: Kind, point = canvas.current?.center() || { x: 0, y: 0 }) {
    try {
      if (kind === 'internet') {
        const existing = net.devices.find((d) => d.kind === 'internet');
        if (existing) {
          setSelected(existing.id);
          notify('Internet jest już w projekcie. Połącz go z jednym routerem lub firewallem.');
          return;
        }
      }
      const device = createNetworkDevice(net, kind, point);
      commit({ ...net, devices: [...net.devices, device] });
      setSelected(device.id);
      if (kind === 'vm') openEditor(device.id);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function addGuest(hostId: string) {
    const host = net.devices.find((d) => d.id === hostId);
    if (!host) return;
    try {
      const vm = createGuestDevice(net, host);
      commit({ ...net, devices: [...net.devices, vm] });
      setSelected(vm.id);
      openEditor(vm.id);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function duplicate(id: string) {
    const d = net.devices.find((d) => d.id === id);
    if (!d) return;
    if (d.kind === 'internet') {
      notify('Projekt ma jeden domyślny obiekt Internet.');
      return;
    }
    try {
      const copy = duplicateNetworkDevice(net, d);
      commit({ ...net, devices: [...net.devices, copy] });
      setSelected(copy.id);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function cancelConnection() {
    setConnectionError('');
    setConnection(null);
    setConnectionPort(null);
    setPortPicker(null);
    setTool('select');
  }
  function beginConnection(id: string) {
    setConnectionError('');
    const device = net.devices.find((d) => d.id === id);
    if (!device) return;
    setContext(null);
    setTool('connect');
    setConnection(id);
    setConnectionPort(null);
    setPortPicker(device.kind === 'vm' ? null : { deviceId: id, target: false });
    if (device.kind === 'vm')
      notify('Wybierz hypervisor dla karty wirtualnej. Nie zajmie to fizycznego gniazda hosta.');
  }
  function connect(id: string) {
    if (!connection) {
      beginConnection(id);
      return;
    }
    if (connection === id) {
      if (net.devices.find((d) => d.id === id)?.kind !== 'vm')
        setPortPicker({ deviceId: id, target: false });
      return;
    }
    const vm = net.devices.find((d) => d.kind === 'vm' && (d.id === id || d.id === connection));
    if (vm) {
      const host = net.devices.find((d) => d.id === (vm.id === id ? connection : id));
      if (!host || !isHypervisor(host)) {
        notify('VM połącz z serwerem, który ma rolę hypervisora.');
        return;
      }
      commit({
        ...net,
        devices: net.devices.map((d) => (d.id === vm.id ? { ...d, hostId: host.id } : d)),
        links: net.links.filter((l) => l.a !== vm.id && l.b !== vm.id),
      });
      notify('Przypisano kartę VM do hypervisora. Fizyczne porty hosta pozostają wolne.');
      cancelConnection();
      return;
    }
    if (!connectionPort) {
      setPortPicker({ deviceId: connection, target: false });
      return;
    }
    setPortPicker({ deviceId: id, target: true });
    setConnectionError('');
  }
  function chooseConnectionPort(port: Port, options?: { cable: Cable; lengthMeters: number }) {
    setConnectionError('');
    if (!portPicker || !connection) return;
    if (!portPicker.target) {
      setConnectionPort(port.id);
      setPortPicker(null);
      return;
    }
    try {
      const source = net.devices.find((d) => d.id === connection);
      const sourcePort = source?.ports?.find((p) => p.id === connectionPort);
      if (!source || !sourcePort)
        throw Error('Port początkowy już nie istnieje. Wybierz go ponownie.');
      const next = createPortConnection(
        net,
        connection,
        sourcePort.id,
        portPicker.deviceId,
        port.id,
        crypto.randomUUID(),
        options,
      );
      commit(next);
      notify(
        `Połączono ${source.name} / ${sourcePort.name} ↔ ${net.devices.find((d) => d.id === portPicker.deviceId)?.name} / ${port.name}.`,
      );
      cancelConnection();
    } catch (e) {
      setConnectionError((e as Error).message);
    }
  }
  function renewClient(id: string) {
    const next = reconcileDhcp(net, Date.now(), id);
    commit(next);
    notify('DHCP: odnowiono dzierżawę i opcje DNS, jeżeli serwer jest osiągalny.');
  }
  function changeTool(next: Tool) {
    setTool(next);
    setConnection(null);
    setConnectionPort(null);
    setPortPicker(null);
  }
  function exportFile() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(net, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${net.name.replace(/[^\p{L}\d-]/gu, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Projekt zapisany jako JSON.');
  }
  async function importFile(f?: File) {
    if (!f) return;
    try {
      const next = parseNetwork(await f.text());
      commit(next);
      setSelected(null);
      setConnection(null);
      setProbe({
        ...probe,
        source: next.devices[0]?.id || '',
        destination: next.devices.at(-1)?.id || '',
      });
      notify('Projekt zaimportowany. Dopasuj widok klawiszem F.');
    } catch (e) {
      notify((e as Error).message);
    }
    if (file.current) file.current.value = '';
  }
  function targetProbe(id: string, field: 'source' | 'destination') {
    setProbe({ ...probe, [field]: id });
    setSimulation(true);
    setContext(null);
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!simulation) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => canvas.current?.fit());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [simulation]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as Element).closest('input,textarea,select,dialog,[role=menu],[contenteditable]')
      )
        return;
      if (e.key === 'Escape') {
        setContext(null);
        setConnection(null);
        setTool('select');
        setSelected(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'v') changeTool('select');
      if (e.key === 'h') changeTool('pan');
      if (e.key === 'c') changeTool('connect');
      if (e.key === 'f') canvas.current?.fit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  return (
    <div className="app">
      <header className="topbar">
        <a href="./" className="brand" aria-label="Netweave">
          <span className="brandmark">
            <NetworkIcon weight="bold" />
          </span>
          netweave
        </a>
        <span className="header-divider" />
        <input
          className="project-name"
          key={net.name}
          aria-label="Nazwa projektu"
          defaultValue={net.name}
          maxLength={60}
          onBlur={(e) => {
            const name = e.target.value.trim() || 'Nowa sieć';
            if (name !== net.name) commit({ ...net, name });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span className="save-state">
          <CheckCircle />
          {saved ? 'Zapisano' : 'Zapisywanie…'}
        </span>
        <div className="header-actions">
          <button
            className="file-action"
            aria-label="Resetuj projekt"
            onClick={() => {
              replaceProject(blankProject());
              notify(
                'Projekt wyczyszczony; Internet pozostaje domyślny. Cofnij przywróci poprzednią sieć.',
              );
            }}
            title="Wyczyść projekt; można cofnąć"
          >
            <Trash />
            <span>Resetuj</span>
          </button>
          <ExampleMenu
            load={(next) => {
              replaceProject(next);
              notify('Wczytano projekt. W panelu symulacji wybierz scenariusz testu.');
            }}
          />
          <button
            className="file-action"
            aria-label="Importuj JSON"
            onClick={() => file.current?.click()}
            title="Importuj JSON"
          >
            <UploadSimple />
            <span>Importuj</span>
          </button>
          <button
            className="file-action"
            aria-label="Eksportuj JSON"
            onClick={exportFile}
            title="Eksportuj JSON"
          >
            <DownloadSimple />
            <span>Eksportuj</span>
          </button>
          <span className="header-divider" />
          <button
            className="diagnostics-button"
            aria-label="Diagnostyka"
            onClick={() => setDiagnosticsOpen(true)}
            title="Sprawdź porty, VLAN-y, adresację i PoE"
          >
            <Info />
            <span>Diagnostyka</span>
          </button>
          <button
            className="vlan-button"
            aria-label="Sieci i VLAN-y"
            onClick={() => setVlansOpen('all')}
          >
            <SquaresFour />
            <span>Sieci i VLAN-y</span>
            <b>{net.vlans.length}</b>
          </button>
          <button
            aria-label={simulation ? 'Projektowanie' : 'Symulacja'}
            className={simulation ? 'simulation-active' : 'primary'}
            onClick={() => {
              if (simulation) {
                sim.stop();
                setSimulation(false);
              } else setSimulation(true);
            }}
          >
            <Play weight="fill" />
            <span>{simulation ? 'Projektowanie' : 'Symulacja'}</span>
          </button>
          <button className="icon-button" aria-label="Pomoc" onClick={() => setHelp(true)}>
            <Question />
          </button>
        </div>
        <input
          hidden
          ref={file}
          type="file"
          accept=".json,application/json"
          onChange={(e) => importFile(e.target.files?.[0])}
        />
      </header>
      <div className="workspace">
        <DeviceLibrary
          network={net}
          selected={selected}
          select={setSelected}
          edit={openEditor}
          add={add}
          editVlans={(id) => setVlansOpen(id ?? 'all')}
        />
        <main className="editor">
          <div className="editor-toolbar">
            <div className="project-summary">
              <span className="status-dot" />
              {net.devices.length} urządzeń <i /> {topologyLinks(net).length} połączeń{' '}
              <span className="mode-tag">{simulation ? 'Symulacja' : 'Projektowanie'}</span>
            </div>
            <div className="history-tools">
              <button
                disabled={!past.length}
                title="Cofnij (Ctrl+Z)"
                aria-label="Cofnij"
                onClick={undo}
              >
                <ArrowCounterClockwise />
              </button>
              <button
                disabled={!future.length}
                title="Ponów (Ctrl+Shift+Z)"
                aria-label="Ponów"
                onClick={redo}
              >
                <ArrowClockwise />
              </button>
              <span />
              <button
                className={grid ? 'active' : ''}
                title="Siatka izometryczna"
                aria-label="Siatka izometryczna"
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
              >
                <SquaresFour />
              </button>
            </div>
          </div>
          <NetworkCanvas
            ref={canvas}
            network={net}
            selected={selected}
            select={setSelected}
            edit={openEditor}
            editPorts={(id) => openEditor(id, 'ports')}
            editInterfaces={(id) => openEditor(id, 'interfaces')}
            moveGroup={(id, delta) => commit(moveNetworkGroup(net, id, delta))}
            move={(id, point) =>
              commit({
                ...net,
                devices: net.devices.map((d) => (d.id === id ? { ...d, ...point } : d)),
              })
            }
            add={add}
            remove={() => remove()}
            connect={connect}
            connection={connection}
            connectionLabel={
              connection
                ? `${net.devices.find((d) => d.id === connection)?.name}${connectionPort ? ` / ${net.devices.find((d) => d.id === connection)?.ports?.find((p) => p.id === connectionPort)?.name}` : ''}`
                : undefined
            }
            cancelConnection={cancelConnection}
            tool={tool}
            setTool={changeTool}
            grid={grid}
            context={setContext}
            flight={sim.flight}
            active={simulation ? sim.active : undefined}
            hop={sim.hop}
          />
          <footer className="statusbar">
            <span>
              <span className="status-dot" />
              {net.devices.filter((d) => d.online).length} online <i /> {net.vlans.length} VLAN-y
            </span>
            <span>
              <kbd>V</kbd> wybierz <kbd>H</kbd> przesuń <kbd>C</kbd> połącz <kbd>F</kbd> dopasuj{' '}
              <span className="footer-separator">·</span> Prawy przycisk: menu
            </span>
            <span>{saved ? 'Wszystkie zmiany zapisane lokalnie' : 'Zapisywanie zmian…'}</span>
          </footer>
        </main>
        {simulation && (
          <TrafficPanel
            network={net}
            probe={probe}
            setProbe={setProbe}
            sim={sim}
            editInterfaces={(id) => openEditor(id, 'interfaces')}
            close={() => {
              sim.stop();
              setSimulation(false);
            }}
          />
        )}
      </div>
      {portPicker &&
        pickingDevice &&
        (!portPicker.target || (connectionDevice && connectionSocket)) && (
          <PortConnectionDialog
            key={`${portPicker.deviceId}:${portPicker.target}`}
            network={net}
            device={pickingDevice}
            source={
              portPicker.target && connectionDevice && connectionSocket
                ? { device: connectionDevice, port: connectionSocket }
                : undefined
            }
            choose={chooseConnectionPort}
            error={connectionError}
            close={() => {
              if (portPicker.target) setPortPicker(null);
              else cancelConnection();
            }}
            configure={() => {
              const id = portPicker.deviceId;
              cancelConnection();
              openEditor(id, 'ports');
            }}
          />
        )}
      {editDevice && (
        <DeviceDialog
          key={`${editDevice.id}:${editingTab}`}
          initialTab={editingTab}
          device={editDevice}
          network={net}
          editRelated={openEditor}
          addGuest={addGuest}
          close={() => setEditing(null)}
          save={(device, vlans) => {
            commit({
              ...net,
              vlans: vlans || net.vlans,
              devices: net.devices.map((d) => (d.id === device.id ? device : d)),
              links:
                device.kind === 'vm'
                  ? net.links.filter((l) => l.a !== device.id && l.b !== device.id)
                  : net.links,
            });
            setEditing(null);
          }}
        />
      )}
      {linkForEdit && (
        <LinkDialog
          link={linkForEdit}
          network={net}
          close={() => setEditingLink(null)}
          save={(link, devices) => {
            commit({
              ...net,
              devices: devices || net.devices,
              links: net.links.map((l) => (l.id === link.id ? link : l)),
            });
            setEditingLink(null);
          }}
        />
      )}
      {vlansOpen && (
        <VlanDialog
          network={net}
          initialId={typeof vlansOpen === 'number' ? vlansOpen : undefined}
          close={() => setVlansOpen(null)}
          save={(next) => {
            commit(next);
            notify('Zapisano konfigurację sieci.');
          }}
        />
      )}
      {diagnosticsOpen && (
        <DiagnosticsDialog
          network={net}
          lastResult={sim.logs.find((l) => l.status === 'complete')?.result}
          close={() => setDiagnosticsOpen(false)}
          inspect={openEditor}
        />
      )}
      {help && <HelpDialog close={() => setHelp(false)} />}
      {context && (
        <ContextMenu target={context} close={() => setContext(null)}>
          {context.type === 'device' ? (
            (() => {
              const d = net.devices.find((d) => d.id === context.id);
              if (!d) return null;
              return (
                <>
                  <div className="context-title">
                    {d.name}
                    <small>{d.ip}</small>
                  </div>
                  <MenuItem icon={<GearSix />} action={() => openEditor(d.id)}>
                    Edytuj urządzenie <kbd>Enter</kbd>
                  </MenuItem>
                  <MenuItem
                    icon={<LinkSimple />}
                    action={() => {
                      beginConnection(d.id);
                    }}
                  >
                    Połącz z urządzeniem
                  </MenuItem>
                  <MenuItem icon={<Copy />} action={() => duplicate(d.id)}>
                    Duplikuj
                  </MenuItem>
                  {d.ipMode === 'auto' && (
                    <MenuItem icon={<ArrowClockwise />} action={() => renewClient(d.id)}>
                      Odnów DHCP / DNS
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={<Power />}
                    action={() =>
                      commit({
                        ...net,
                        devices: net.devices.map((x) =>
                          x.id === d.id ? { ...x, online: !x.online } : x,
                        ),
                      })
                    }
                  >
                    {d.online ? 'Wyłącz urządzenie' : 'Włącz urządzenie'}
                  </MenuItem>
                  <hr />
                  <MenuItem icon={<Play />} action={() => targetProbe(d.id, 'source')}>
                    Ustaw jako źródło testu
                  </MenuItem>
                  <MenuItem icon={<Play />} action={() => targetProbe(d.id, 'destination')}>
                    Ustaw jako cel testu
                  </MenuItem>
                  <hr />
                  <MenuItem danger icon={<Trash />} action={() => remove(d.id)}>
                    Usuń urządzenie <kbd>Del</kbd>
                  </MenuItem>
                </>
              );
            })()
          ) : context.type === 'zone' ? (
            <>
              <div className="context-title">Sekcja sieci — cała grupa</div>
              <MenuItem icon={<GearSix />} action={() => openEditor(context.id!)}>
                Edytuj obszar / VLAN / DHCP / DNS
              </MenuItem>
              <div className="context-title">
                <small>
                  Przeciągnij nagłówek lub tło sekcji.
                  <br />
                  Strzałki przesuwają zaznaczoną grupę.
                </small>
              </div>
            </>
          ) : context.type === 'link' ? (
            <>
              <div className="context-title">Połączenie sieciowe</div>
              <MenuItem icon={<GearSix />} action={() => openEditor(context.id!)}>
                Edytuj porty / VLAN-y
              </MenuItem>
              <MenuItem danger icon={<Trash />} action={() => remove(context.id)}>
                Usuń połączenie
              </MenuItem>
            </>
          ) : (
            <>
              <div className="context-title">Plansza</div>
              <MenuItem icon={<SquaresFour />} action={() => setVlansOpen('all')}>
                Zarządzaj VLAN-ami
              </MenuItem>
              <MenuItem icon={<ArrowsOutSimple />} action={() => canvas.current?.fit()}>
                Dopasuj widok <kbd>F</kbd>
              </MenuItem>
            </>
          )}
        </ContextMenu>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info />
          {toast}
          <button aria-label="Zamknij komunikat" onClick={() => setToast('')}>
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
