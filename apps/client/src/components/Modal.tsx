import { type ReactNode, useEffect, useId, useRef } from 'react';

/** Open dialogs, innermost last. Only the top one answers Esc. */
const stack: object[] = [];

/** True while any dialog is open; page shortcuts stay quiet underneath one. */
export function isModalOpen(): boolean {
  return stack.length > 0;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  readonly title: ReactNode;
  readonly children: ReactNode;
  /** Makes the dialog closable: a close button, and Esc while it is the top dialog. */
  readonly onClose?: (() => void) | undefined;
  readonly className?: string | undefined;
}

/** The one dialog shell: backdrop, title, focus moved in on open and given back on close. */
export function Modal({ title, children, onClose, className }: ModalProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const token = useRef({});

  useEffect(() => {
    const me = token.current;
    const before = document.activeElement;
    stack.push(me);
    // A dialog can name the control to start on; otherwise focus starts on the first one.
    const first =
      box.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      box.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box.current)?.focus();
    return () => {
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack.at(-1) !== token.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop">
      <div
        ref={box}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          {onClose && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
