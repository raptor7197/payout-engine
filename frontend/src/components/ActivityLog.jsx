function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default function ActivityLog({ events, loading }) {
  return (
    <section className="flex flex-col rounded-md border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Backend activity log
        </h2>
      </header>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading activity log...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-neutral-500">No activity yet.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-100">{event.message}</span>
                <span className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-300">
                  {event.source}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-neutral-500">
                {formatTimestamp(event.timestamp)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}