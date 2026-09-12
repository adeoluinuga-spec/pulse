"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface PeerInfo {
  name: string;
  initials: string;
  avatarColor: string;
  role: string;
}

interface CollaborationCardProps {
  goalName: string;
  goalPct: number;
  peer: PeerInfo;
  reason: string;
}

export default function CollaborationCard({
  goalName,
  goalPct,
  peer,
  reason,
}: CollaborationCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [fading, setFading] = useState(false);

  const handleDismiss = () => {
    setFading(true);
    setTimeout(() => setDismissed(true), 350);
  };

  if (dismissed) return null;

  return (
    <div
      style={{
        opacity: fading ? 0 : 1,
        transform: fading ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      <div className="bg-ink rounded-lg p-5">
        {/* Pulse accent label */}
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-4 rounded-full bg-pulse flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-pulse">
            Collaboration Suggestion
          </span>
        </div>

        {/* Goal context */}
        <p className="text-white/65 text-xs leading-relaxed mb-4">
          Your{" "}
          <span className="text-white/80 font-semibold">&ldquo;{goalName}&rdquo;</span>{" "}
          goal is at {goalPct}% — a peer session could help unlock the next steps.
        </p>

        {/* Peer card */}
        <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3 mb-3">
          <Avatar initials={peer.initials} color={peer.avatarColor} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">{peer.name}</p>
            <p className="text-white/65 text-[11px] mt-0.5">{peer.role}</p>
          </div>
          <Users size={14} className="text-white/20 flex-shrink-0" />
        </div>

        <p className="text-white/65 text-xs leading-relaxed mb-5">{reason}</p>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="flex-1 bg-pulse text-white text-sm font-semibold py-2.5 rounded-md hover:bg-pulse/90 transition-colors">
            Request a session
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 text-white/65 text-sm font-medium py-2.5 rounded-md border border-white/10 hover:border-white/20 hover:text-white/70 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
