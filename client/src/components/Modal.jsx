export default function Modal({ title, onClose, children, footer, large }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${large ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-link" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
