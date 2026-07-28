import { useAccessibleDialog } from "./useAccessibleDialog";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { dialogProps, titleId } = useAccessibleDialog(open, onCancel);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        {...dialogProps}
        className="modal confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "primary-btn danger-btn" : "primary-btn"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
