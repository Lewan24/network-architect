import type { Network } from './networkTypes';

export const HISTORY_LIMIT = 50;
export type ProjectHistory = { network: Network; past: Network[]; future: Network[] };

export function recordProject(state: ProjectHistory, network: Network): ProjectHistory {
  return { network, past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.network], future: [] };
}

export function undoProject(state: ProjectHistory): ProjectHistory {
  const network = state.past.at(-1);
  if (!network) return state;
  return { network, past: state.past.slice(0, -1), future: [state.network, ...state.future] };
}

export function redoProject(state: ProjectHistory): ProjectHistory {
  const network = state.future[0];
  if (!network) return state;
  return { network, past: [...state.past, state.network], future: state.future.slice(1) };
}
