"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./payroll.module.css";

/**
 * A native modal dialog for payroll forms.
 *
 * Built on <dialog> so focus is trapped and Escape closes it without a
 * library — except while a save is in flight, when closing would leave the
 * person unsure whether their change went through.
 */
export default function PayrollDialog({
  open,
  title,
  onClose,
  busy = false,
  error,
  errors,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  error?: string;
  errors?: string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>{title}</h2>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
          {errors?.length ? (
            <ul>
              {errors.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {children}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
          Close
        </button>
        {footer}
      </div>
    </dialog>
  );
}
