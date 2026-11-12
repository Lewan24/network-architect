import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ContextTarget } from '../canvas/NetworkCanvas';

export function MenuItem({
  icon,
  children,
  action,
  danger = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  action: () => void;
  danger?: boolean;
}) {
  return (
    <button role="menuitem" className={danger ? 'danger-item' : ''} onClick={action}>
      {icon}
      {children}
    </button>
  );
}
export function ContextMenu({
  target,
  close,
  children,
}: {
  target: ContextTarget;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(target.screen);
  useLayoutEffect(() => {
    const box = ref.current!.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(target.screen.x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(target.screen.y, window.innerHeight - box.height - 8)),
    });
    ref.current!.querySelector<HTMLButtonElement>('button')?.focus();
  }, [target]);
  return (
    <div
      className="context-dismiss"
      onPointerDown={close}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div
        ref={ref}
        className="context-menu"
        role="menu"
        aria-label="Menu kontekstowe"
        style={{ left: position.x, top: position.y }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if ((e.target as Element).closest('button')) close();
        }}
        onKeyDown={(e) => {
          const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            buttons[
              (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            ]?.focus();
          }
          if (e.key === 'Tab') close();
        }}
      >
        {children}
      </div>
    </div>
  );
}
