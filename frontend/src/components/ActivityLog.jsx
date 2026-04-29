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
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Backend activity log</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading activity log...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ul className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
          {events.map((event) => (
            <li key={event.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900">{event.message}</span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase text-slate-600">
                  {event.source}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {formatTimestamp(event.timestamp)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
