import type { ReactNode } from 'react';
export function SettingsSection({
  title,
  description,
  tone = 'blue',
  children,
}: {
  title: string;
  description?: string;
  tone?: 'blue' | 'green' | 'amber' | 'purple';
  children: ReactNode;
}) {
  return (
    <section className={`settings-section tone-${tone}`}>
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-section-content">{children}</div>
    </section>
  );
}
