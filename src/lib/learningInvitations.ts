export type InvitationTrainee = {
  email: string | null;
  revoked_at: string | null;
  expires_at: string;
};

export function invitationUnavailable(
  trainee: InvitationTrainee,
  now = Date.now(),
): string | null {
  if (!trainee.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trainee.email))
    return "This trainee needs a valid email address.";
  if (trainee.revoked_at || !(Date.parse(trainee.expires_at) > now))
    return "Issue a new personal link before sending this invitation.";
  return null;
}

export function learningInvitationEmail(input: {
  name: string;
  programme: string;
  client: string;
  token: string;
  origin: string;
}): { subject: string; html: string } {
  const url = new URL(input.origin);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Configure a secure public application URL.");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new Error("Invalid personal link.");
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const link = `${url.origin}/t/${input.token}`;
  return {
    subject: `Your learning invitation: ${input.programme.replace(/[\r\n]+/g, " ")}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111827"><p>Pulse Learning</p><h1>${escape(input.programme)}</h1><p>Hello ${escape(input.name)},</p><p>You are invited to ${escape(input.programme)} for ${escape(input.client)}.</p><p><a href="${escape(link)}" style="display:inline-block;background:#111827;color:white;padding:14px 20px;text-decoration:none;border-radius:6px">Open my learning dashboard</a></p><p>No account or password is needed. Keep this link private and use it again to return to your saved work.</p><p>For questions, contact your training facilitator.</p></div>`,
  };
}
