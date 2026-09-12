"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./planning.module.css";

export default function PlanningNav() {
  const path = usePathname();
  return <nav className={styles.nav} aria-label="Performance planning">
    {[["/strategy","Strategy"],["/goals","Goals"],["/kpis","KPIs"],["/appraisal","Appraisal"]].map(([href,label])=>
      <Link href={href} key={href} aria-current={path===href?"page":undefined}>{label}</Link>)}
  </nav>;
}
