import { LogViewer } from "../components/LogViewer";

export function Logs() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4">
        <h1 className="text-xl font-semibold">Logs</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Live stream from the runner · switch to History to browse by time range
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <LogViewer />
      </div>
    </div>
  );
}
