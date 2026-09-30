import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, subtitle, onClose, footer, children, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={17} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </section>
    </div>
  );
}
