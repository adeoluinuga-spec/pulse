"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";

import { useUser } from "@/context/UserContext";
import MyTeamTab from "./MyTeamTab";
import TasksTab from "./TasksTab";
import ChatTab from "./ChatTab";
import EscalationsTab from "./EscalationsTab";
import { api, type Person, type TeamResponse } from "./teamClient";

/**
 * The team workspace, built entirely on the published org chart and what
 * people have actually saved. Every tab reads from /api/team/*.
 *
 * My Team appears for anyone the org chart gives a team — decided by the
 * server, not by a flag on the profile. Tasks, chat and escalations are for
 * everyone: a concern has to be raisable by the people who have it.
 */

type TabKey = "team" | "tasks" | "chat" | "escalations";

export default function TeamWorkspace() {
  const { user } = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const [team, setTeam] = useState<{ data: TeamResponse | null; error: string }>({ data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    api<TeamResponse>("/api/team")
      .then((data) => !cancelled && setTeam({ data, error: "" }))
      .catch((thrown: Error) => !cancelled && setTeam({ data: null, error: thrown.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  const leadsPeople = user.peopleResponsibility !== "none" || Boolean(team.data?.members.length);

  const tabs: { key: TabKey; label: string }[] = [
    ...(leadsPeople ? [{ key: "team" as const, label: "My Team" }] : []),
    { key: "tasks", label: "Tasks" },
    { key: "chat", label: "Chat" },
    { key: "escalations", label: "Escalations" },
  ];

  // An explicit ?tab= wins; otherwise open on My Team for anyone with a team,
  // which may only be known once the server has answered.
  const requested = params.get("tab") as TabKey | null;
  const [chosen, setChosen] = useState<TabKey | null>(requested);
  const preferred = chosen ?? (leadsPeople ? "team" : "tasks");
  const active = tabs.some((tab) => tab.key === preferred) ? preferred : tabs[0].key;
  const [taskFor, setTaskFor] = useState<Person | null>(null);
  const [openChannel, setOpenChannel] = useState<string | null>(params.get("channel"));

  const go = (tab: TabKey) => {
    setChosen(tab);
    router.replace(`/dashboard/team?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="dashboard-page space-y-5">
      <section className="px-4">
        <div role="tablist" aria-label="Team workspace" className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => go(tab.key)}
              className={clsx("min-w-fit flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors md:text-sm", active === tab.key ? "bg-ink text-white" : "text-muted hover:text-ink")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {active === "team" && (
        <MyTeamTab
          data={team.data}
          error={team.error}
          onMessage={(channel) => {
            setOpenChannel(channel);
            go("chat");
          }}
          onGiveTask={(person) => {
            setTaskFor(person);
            go("tasks");
          }}
        />
      )}
      {active === "tasks" && <TasksTab presetAssignee={taskFor} onPresetUsed={() => setTaskFor(null)} />}
      {active === "chat" && <ChatTab initialChannel={openChannel} />}
      {active === "escalations" && <EscalationsTab />}
    </div>
  );
}
