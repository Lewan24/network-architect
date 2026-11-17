import { useSyncExternalStore } from 'react';
let advanced = false;
try {
  advanced =
    typeof localStorage !== 'undefined' && localStorage.getItem('netweave-advanced') === 'true';
} catch {
  /* Preference is optional. */
}
const listeners = new Set<() => void>();
export function useAdvancedMode() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => advanced,
    () => false,
  );
}
export function AdvancedToggle() {
  const enabled = useAdvancedMode();
  return (
    <label className="checkbox-label advanced-toggle">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          advanced = e.target.checked;
          try {
            localStorage.setItem('netweave-advanced', String(advanced));
          } catch {
            /* Session preference still works. */
          }
          listeners.forEach((fn) => fn());
        }}
      />
      Tryb zaawansowany
    </label>
  );
}
