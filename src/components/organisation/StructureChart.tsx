"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, Users } from "lucide-react";
import { layoutStructure, type StructureDocument, type StructureEmployee } from "@/lib/organisationStructure";
import styles from "./structure.module.css";

export default function StructureChart({ document, employees, selectedId, onSelect, onMove, disabled }: {
  document: StructureDocument; employees: StructureEmployee[]; selectedId: string | null;
  onSelect: (id: string) => void; onMove: (id: string, parentId: string | null) => void; disabled: boolean;
}) {
  const [zoom, setZoom] = useState(0.85);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { placed, width, height } = useMemo(() => layoutStructure(document, collapsed), [document, collapsed]);
  const points = new Map(placed.map(p => [p.position.id, p]));
  const roster = new Map(employees.map(e => [e.id, e]));
  return <section className={styles.chartPanel} aria-label="Organisation chart">
    <div className={styles.chartToolbar}>
      <span className={styles.muted}>Select a position to edit. Drag a card onto its manager to move it.</span>
      <div className={styles.inline}>
        <button type="button" className={styles.iconButton} aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}><Minus size={16} /></button>
        <button type="button" className={styles.smallButton} onClick={() => setZoom(1)} aria-label="Reset chart zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" className={styles.iconButton} aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}><Plus size={16} /></button>
        <button type="button" className={styles.smallButton} onClick={() => {
          const canvas = canvasRef.current;
          if (canvas) { setZoom(Math.max(0.15, Math.min(1, canvas.clientWidth / width, canvas.clientHeight / height))); canvas.scrollTo(0, 0); }
        }}>Fit chart</button>
        <button type="button" className={styles.smallButton} onClick={() => setCollapsed(new Set())}>Expand all</button>
      </div>
    </div>
    <div ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="Scrollable organisation chart. Use the position editor to change reporting lines with the keyboard.">
      {!placed.length ? <div className={styles.chartEmpty}><Users size={32} /><h2>Make room for your people</h2><p>Add a position or choose a template, then assign staff from your existing roster.</p></div> :
      <div style={{ width: width * zoom, height: height * zoom }}>
        <div style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "top left", position: "relative" }}>
          <svg width={width} height={height} className={styles.connections} aria-hidden="true">
            {placed.map(({ position, x, y }) => {
              const parent = position.parentId ? points.get(position.parentId) : null;
              if (!parent) return null;
              const vertical = document.layout === "vertical";
              const sx = parent.x + (vertical ? 116 : 232), sy = parent.y + (vertical ? 128 : 64);
              const tx = x + (vertical ? 116 : 0), ty = y + (vertical ? 0 : 64);
              const d = vertical ? `M ${sx} ${sy} V ${(sy + ty) / 2} H ${tx} V ${ty}` : `M ${sx} ${sy} H ${(sx + tx) / 2} V ${ty} H ${tx}`;
              return <path key={position.id} d={d} fill="none" stroke="var(--structure-line)" strokeWidth={2} />;
            })}
          </svg>
          {placed.map(({ position: p, x, y }) => {
            const employee = p.employeeId ? roster.get(p.employeeId) : null;
            const count = document.positions.filter(child => child.parentId === p.id).length;
            return <div key={p.id} className={`${styles.node} ${selectedId === p.id ? styles.nodeSelected : ""} ${dragOver === p.id ? styles.dropTarget : ""}`}
              style={{ left: x, top: y }} draggable={!disabled}
              onDragStart={event => { event.dataTransfer.setData("application/pulse-position", p.id); event.dataTransfer.effectAllowed = "move"; }}
              onDragOver={event => { if (!disabled && event.dataTransfer.types.includes("application/pulse-position")) { event.preventDefault(); setDragOver(p.id); } }}
              onDragLeave={() => setDragOver(null)} onDragEnd={() => setDragOver(null)}
              onDrop={event => { event.preventDefault(); setDragOver(null); if (!disabled) onMove(event.dataTransfer.getData("application/pulse-position"), p.id); }}>
              <button type="button" className={styles.nodeMain} aria-pressed={selectedId === p.id} onClick={() => onSelect(p.id)}>
                <span className={styles.nodeDepartment}>{p.department || "Department not set"}{p.team ? ` / ${p.team}` : ""}</span>
                <strong className={styles.nodeTitle}>{p.title}</strong>
                <span className={styles.nodePerson}><span className={styles.avatar}>{employee ? employee.name.split(/\s+/).map(n => n[0]).slice(0, 2).join("") : "+"}</span><span>{employee?.name ?? "Vacant · assign someone"}</span></span>
              </button>
              {count > 0 && <button type="button" className={styles.collapse} aria-label={`${collapsed.has(p.id) ? "Expand" : "Collapse"} ${count} positions under ${p.title}`} aria-expanded={!collapsed.has(p.id)} onClick={() => setCollapsed(previous => {
                const next = new Set(previous); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next;
              })}>{collapsed.has(p.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}{count}</button>}
            </div>;
          })}
        </div>
      </div>}
    </div>
    <div className={styles.chartFooter}><span><span className={styles.legendDot} /> Primary reporting line</span><span>Vacant positions stay visible in your plan</span></div>
  </section>;
}
