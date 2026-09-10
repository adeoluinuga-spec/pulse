"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./appraisal.module.css";
export default function AppraisalDialog({open,title,onClose,busy,error,children}:{open:boolean;title:string;onClose:()=>void;busy:boolean;error?:string;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)ref.current?.showModal();else ref.current?.close();},[open]);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event=>{if(busy)event.preventDefault();else onClose();}}><h2>{title}</h2>{error&&<div className={styles.error} role="alert">{error}</div>}{children}<div className={styles.actions}><button className={styles.button} onClick={onClose} disabled={busy}>Close</button></div></dialog>;
}
