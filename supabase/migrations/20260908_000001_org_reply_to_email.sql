-- PER-ORGANISATION REPLY-TO ADDRESS
--
-- Pulse sends assessment mail from its own verified domain, so a rater or a
-- participant replying to an invitation would otherwise reply into a void.
-- Replies must reach that organisation's own HR team, not Pulse.
--
-- Optional by design: when it is null the sender falls back to the
-- organisation's hr_admin employee address, so a newly onboarded tenant needs
-- no configuration at all. Set it only when an organisation wants replies to go
-- somewhere other than their HR admin — a shared hr@ mailbox, say.
--
-- Purely additive: one nullable column. Nothing dropped or retyped.

alter table public.organisations
  add column if not exists reply_to_email text;

comment on column public.organisations.reply_to_email is
  'Where replies to Pulse-sent assessment email should go for this organisation. Null falls back to the org''s hr_admin employee address.';
