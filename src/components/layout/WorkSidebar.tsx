"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ComponentType } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  Banknote,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ClipboardList,
  MessageSquare,
  FileText,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Home,
  ShieldAlert,
  ShieldCheck,
  Settings2,
  Star,
  Target,
  Users,
  type LucideProps,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";

type Icon = ComponentType<LucideProps>;

type NavigationItem = {
  label: string;
  href?: string;
  icon: Icon;
  comingSoon?: boolean;
  description?: string;
};

type NavigationGroup = {
  id: string;
  label: string;
  icon: Icon;
  items: NavigationItem[];
};

function active(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemIsActive(item: NavigationItem, pathname: string, searchParams: ReturnType<typeof useSearchParams>) {
  if (!item.href || item.comingSoon) return false;
  if (item.href === "/dashboard/hr?mode=setup") {
    return pathname === "/dashboard/hr" && searchParams.get("mode") === "setup";
  }
  if (item.href === "/dashboard/hr") {
    return pathname === "/dashboard/hr" && searchParams.get("mode") !== "setup";
  }
  return active(pathname, item.href);
}

export default function WorkSidebar() {
  return <Suspense><SidebarContent /></Suspense>;
}

function SidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profileImages } = useUser();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const profileImage = profileImages[user.id];
  const isHr = user.platformRole === "hr_admin" || user.platformRole === "super_admin";
  const assessmentHref = isHr ? "/assessments" : "/dashboard/360";
  const likelyPayrollRole = isHr || user.platformRole === "executive_view";
  const [grantedPayroll, setGrantedPayroll] = useState(false);

  // Payroll can be delegated by name to somebody without an admin role, so for
  // everyone else ask the server whether they have been granted it.
  useEffect(() => {
    if (likelyPayrollRole) return;
    let cancelled = false;
    fetch("/api/payroll/access", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { canAccessPayroll?: boolean } | null) => {
        if (!cancelled) setGrantedPayroll(body?.canAccessPayroll === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [likelyPayrollRole, user.id]);

  const workspaceGroups: NavigationGroup[] = [
    {
      id: "performance",
      label: "Performance management",
      icon: BarChart3,
      items: [
        { label: "Performance", href: "/dashboard/performance", icon: BarChart3 },
  { label: "Appraisal", href: "/appraisal", icon: ClipboardList },
        { label: "Goals", href: "/goals", icon: Target },
        { label: "Strategy", href: "/strategy", icon: GitBranch },
        { label: "KPIs", href: "/kpis", icon: Target },
        { label: "Reports", href: "/dashboard/reports", icon: FileText },
        { label: "Performance improvement", icon: ShieldAlert, comingSoon: true, description: "Performance improvement plans are being prepared for a future Pulse release." },
      ],
    },
    {
      id: "reviews",
      label: "Reviews & appraisals",
      icon: ClipboardList,
      items: [
        { label: "360 assessments", href: assessmentHref, icon: ClipboardList },
        ...(isHr ? [{ label: "Staff surveys", href: "/surveys", icon: MessageSquare }] : []),
        { label: "Performance appraisal", href: "/appraisal", icon: Star },
      ],
    },
    {
      id: "people-operations",
      label: "People operations",
      icon: Users,
      items: [
        { label: "Leave", icon: BriefcaseBusiness, comingSoon: true, description: "Leave management is being prepared for a future Pulse release." },
        // Payroll is shown to admin roles and to anyone granted it by name; the
        // page itself still refuses anyone else. Everyone can reach their own payslips.
        ...(likelyPayrollRole || grantedPayroll ? [{ label: "Payroll", href: "/payroll", icon: Banknote }] : []),
        { label: "My payslips", href: "/payslips", icon: FileText },
      ],
    },
    {
      id: "talent-development",
      label: "Talent development",
      icon: GraduationCap,
      items: [
        { label: "Learning & development", icon: GraduationCap, comingSoon: true, description: "Learning and development planning is being prepared for a future Pulse release." },
        { label: "Development plans", icon: Target, comingSoon: true, description: "Individual development plans are being prepared for a future Pulse release." },
      ],
    },
  ];

  const hrGroup: NavigationGroup | null = isHr ? {
    id: "hr-dashboard",
    label: "HR dashboard",
    icon: ShieldCheck,
    items: [
      { label: "Dashboard", href: "/dashboard/hr", icon: ShieldCheck },
      { label: "Organisation setup", href: "/dashboard/hr?mode=setup", icon: Settings2 },
      { label: "Organisation structure", href: "/dashboard/organisation", icon: GitBranch },
    ],
  } : null;

  const activeGroupIds = [...workspaceGroups, ...(hrGroup ? [hrGroup] : [])]
    .filter((group) => group.items.some((item) => itemIsActive(item, pathname, searchParams)))
    .map((group) => group.id);

  useEffect(() => {
    if (!activeGroupIds.length) return;
    setExpanded((current) => {
      const next = { ...current };
      activeGroupIds.forEach((id) => { next[id] = true; });
      return next;
    });
  }, [pathname, searchParams, activeGroupIds.join(",")]);

  function openComingSoon(item: NavigationItem) {
    showToast(item.description ?? `${item.label} is being prepared for a future Pulse release.`, "info");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-paper-200 bg-surface text-ink md:flex md:flex-col">
      <Link href="/dashboard" className="flex h-20 items-center gap-2.5 border-b border-paper-100 px-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm font-semibold text-white">P</span>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold text-ink">Pulse</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Work OS</p>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-5" aria-label="Workspace navigation">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300">Workspace</p>
        <div className="space-y-0.5">
          <SidebarLink item={{ label: "Home", href: "/dashboard", icon: Home }} pathname={pathname} searchParams={searchParams} />
          <SidebarLink item={{ label: "Profile", href: "/dashboard/profile", icon: BriefcaseBusiness }} pathname={pathname} searchParams={searchParams} />
          {workspaceGroups.map((group) => (
            <NavigationGroupView
              key={group.id}
              group={group}
              expanded={expanded[group.id] ?? false}
              onToggle={() => setExpanded((current) => ({ ...current, [group.id]: !current[group.id] }))}
              pathname={pathname}
              searchParams={searchParams}
              onComingSoon={openComingSoon}
            />
          ))}
          <SidebarLink item={{ label: "AI & wellbeing", href: "/dashboard/ai-wellbeing", icon: HeartPulse }} pathname={pathname} searchParams={searchParams} />
        </div>
      </nav>

      {/* Team is for everyone: tasks, chat and escalations are not only for managers. */}
      <div className="border-t border-paper-200 px-3 py-4">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300">Adaptive access</p>
        <div className="space-y-0.5">
          <SidebarLink item={{ label: "Team", href: "/dashboard/team", icon: Users }} pathname={pathname} searchParams={searchParams} />
          {hrGroup && (
            <NavigationGroupView
              group={hrGroup}
              expanded={expanded[hrGroup.id] ?? false}
              onToggle={() => setExpanded((current) => ({ ...current, [hrGroup.id]: !current[hrGroup.id] }))}
              pathname={pathname}
              searchParams={searchParams}
              onComingSoon={openComingSoon}
            />
          )}
          {(user.platformRole === "executive_view" || user.platformRole === "super_admin") && (
            <SidebarLink item={{ label: "Executive", href: "/executive", icon: Building2 }} pathname={pathname} searchParams={searchParams} />
          )}
        </div>
        </div>

      <div className="border-t border-paper-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-paper-100 text-xs font-semibold uppercase text-ink-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profileImage ? <img src={profileImage} alt="" className="h-full w-full object-cover" /> : user.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-muted">{user.role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavigationGroupView({ group, expanded, onToggle, pathname, searchParams, onComingSoon }: {
  group: NavigationGroup;
  expanded: boolean;
  onToggle: () => void;
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  onComingSoon: (item: NavigationItem) => void;
}) {
  const Icon = group.icon;
  const groupActive = group.items.some((item) => itemIsActive(item, pathname, searchParams));
  const panelId = `${group.id}-navigation`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={clsx(
          "group flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] font-medium transition-colors",
          groupActive ? "bg-cobalt-light font-semibold text-cobalt-dark" : "text-ink-500 hover:bg-paper-100 hover:text-ink",
        )}
      >
        <Icon size={16} className={groupActive ? "text-cobalt" : "text-ink-300 group-hover:text-ink-500"} />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <ChevronDown size={15} className={clsx("shrink-0 transition-transform duration-150", expanded && "rotate-180", groupActive ? "text-cobalt" : "text-ink-300")} />
      </button>
      {expanded && (
        <div id={panelId} className="ml-5 mt-0.5 space-y-0.5 border-l border-paper-200 pl-2">
          {group.items.map((item) => (
            <SidebarLink key={item.label} item={item} pathname={pathname} searchParams={searchParams} nested onComingSoon={onComingSoon} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarLink({ item, pathname, searchParams, nested = false, onComingSoon }: {
  item: NavigationItem;
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  nested?: boolean;
  onComingSoon?: (item: NavigationItem) => void;
}) {
  const Icon = item.icon;
  const isActive = itemIsActive(item, pathname, searchParams);
  const className = clsx(
    "group flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
    nested && "min-h-8 py-1 text-[12px]",
    isActive ? "bg-cobalt-light font-semibold text-cobalt-dark" : "text-ink-500 hover:bg-paper-100 hover:text-ink",
    item.comingSoon && "text-ink-400",
  );
  const content = <>
    <Icon size={nested ? 15 : 16} className={isActive ? "text-cobalt" : "text-ink-300 group-hover:text-ink-500"} />
    <span className="min-w-0 flex-1 truncate">{item.label}</span>
    {item.comingSoon && <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-300">Soon</span>}
  </>;

  if (item.comingSoon) {
    return <button type="button" className={className} onClick={() => onComingSoon?.(item)}>{content}</button>;
  }

  return <Link href={item.href ?? "/dashboard"} className={className}>{content}</Link>;
}
