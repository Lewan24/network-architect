import { prepareHardware } from '../model/ports';
import { useEffect, useState } from 'react';
import { createDemoNetwork } from '../examples/demoNetwork';
import { reconcileDhcp } from '../model/dhcp';
import { prepareInternet } from '../model/internetModel';
import { parseNetwork } from '../model/network';
import type { Network } from '../model/networkTypes';
import { recordProject, redoProject, undoProject, type ProjectHistory } from './projectHistory';

const STORAGE_KEY = 'netweave-project';
const SAVE_DELAY_MS = 350;
const LEASE_REFRESH_MS = 15_000;

function loadProject(): Network {
  try {
    return reconcileDhcp(
      prepareHardware(prepareInternet(parseNetwork(localStorage.getItem(STORAGE_KEY) || ''))),
    );
  } catch {
    return reconcileDhcp(prepareHardware(createDemoNetwork()));
  }
}

/** Project data, undo/redo, automatic saves and lease refresh. UI state lives in App. */
export function useProject(notify: (message: string) => void) {
  const [state, setState] = useState<ProjectHistory>(() => ({
    network: loadProject(),
    past: [],
    future: [],
  }));
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.network));
        setSaved(true);
      } catch {
        notify('Zapis lokalny niedostępny. Wyeksportuj projekt do JSON.');
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.network, notify]);

  useEffect(() => {
    const timer = setInterval(
      () =>
        setState((current) => {
          const network = reconcileDhcp(current.network);
          // Lease renewal is a clock update, not an edit, so it must not consume an undo step.
          return JSON.stringify(network.devices) === JSON.stringify(current.network.devices)
            ? current
            : { ...current, network };
        }),
      LEASE_REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, []);

  function commit(network: Network) {
    const normalized = reconcileDhcp(prepareHardware(prepareInternet(network)));
    setState((current) => recordProject(current, normalized));
  }
  function restore(direction: 'undo' | 'redo') {
    setState((current) => {
      const next = direction === 'undo' ? undoProject(current) : redoProject(current);
      return next === current ? current : { ...next, network: reconcileDhcp(next.network) };
    });
  }

  return { ...state, saved, commit, undo: () => restore('undo'), redo: () => restore('redo') };
}
