import { useState } from 'react';
import { Modal } from '../components/Modal';
import type { CanvasText } from '../model/networkTypes';
export function TextAnnotationDialog({
  value,
  save,
  close,
}: {
  value: CanvasText;
  save: (v: CanvasText) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Modal
      title={value.text ? 'Edytuj tekst' : 'Dodaj tekst'}
      description="Nazwij firmę, lokalizację lub część schematu. Etykietę możesz przesuwać na planszy."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.text.trim()) save({ ...draft, text: draft.text.trim() });
        }}
      >
        <div className="dialog-body text-annotation-form">
          <label className="field">
            <span>Treść etykiety</span>
            <textarea
              autoFocus
              rows={3}
              maxLength={2000}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              placeholder="Np. Firma ABC · siedziba główna"
              required
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Rozmiar tekstu</span>
              <input
                type="number"
                min={12}
                max={96}
                value={draft.fontSize}
                onChange={(e) => setDraft({ ...draft, fontSize: +e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Kolor</span>
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </label>
          </div>
          <div
            className="text-annotation-preview"
            style={{ color: draft.color, fontSize: Math.min(96, Math.max(12, draft.fontSize)) }}
          >
            {draft.text || 'Podgląd etykiety'}
          </div>
        </div>
        <footer className="dialog-footer">
          <button type="button" className="secondary" onClick={close}>
            Anuluj
          </button>
          <button className="primary" disabled={!draft.text.trim()}>
            Zapisz tekst
          </button>
        </footer>
      </form>
    </Modal>
  );
}
