export default function ReviewContactPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-pulse-soft text-lg font-semibold text-pulse">P</div>
          <h1 className="mt-5 text-2xl font-semibold leading-tight">Contact HR</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Please contact your HR team or assessment coordinator and ask for a fresh Pulse 360 assessment link.
          </p>
        </div>
      </section>
    </main>
  );
}
