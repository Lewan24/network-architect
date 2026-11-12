import { CaretDown, Network as NetworkIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { networkExamples } from './demoNetwork';
import type { Network } from '../model/network';
export function ExampleMenu({ load }: { load: (network: Network) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  return (
    <div
      className="example-menu"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="example-menu-trigger"
        aria-label="Przykładowe projekty"
        aria-expanded={open}
        aria-controls="example-projects"
        onClick={() => setOpen((value) => !value)}
      >
        <NetworkIcon />
        <span>Przykład</span>
        <CaretDown size={11} />
      </button>
      {open && (
        <div id="example-projects" className="example-menu-panel">
          <p>Przykładowe projekty</p>
          {networkExamples.map((example) => (
            <button
              key={example.id}
              onClick={() => {
                load(example.create());
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <strong>{example.name}</strong>
              <small>{example.description}</small>
            </button>
          ))}
          <small className="example-menu-hint">
            Zastępuje bieżący projekt. Zmianę można cofnąć.
          </small>
        </div>
      )}
    </div>
  );
}
