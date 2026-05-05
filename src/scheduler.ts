export interface ScheduledTask {
  type: "healthcheck" | "lighthouse";
  site: string;
  intervalMs: number;
  nextRun: number;
}

export class Scheduler {
  private _tasks: ScheduledTask[] = [];
  private _inFlight = new Map<string, Promise<void>>();
  private _progress = new Map<string, { pagesCompleted: number; pagesTotal: number; startedAt: number }>();
  private stopping = false;
  private _paused = false;

  rebuild(sites: import("./config.js").Site[], lighthouseStartDelayMs: number): void {
    const now = Date.now();
    const next: ScheduledTask[] = [];
    for (const site of sites) {
      if (site.healthcheck.enabled) {
        const existing = this._tasks.find(
          (t) => t.type === "healthcheck" && t.site === site.name,
        );
        next.push({
          type: "healthcheck",
          site: site.name,
          intervalMs: site.healthcheck.intervalMinutes * 60_000,
          nextRun: existing?.nextRun ?? now,
        });
      }
      if (site.lighthouse.enabled) {
        const existing = this._tasks.find(
          (t) => t.type === "lighthouse" && t.site === site.name,
        );
        next.push({
          type: "lighthouse",
          site: site.name,
          intervalMs: site.lighthouse.intervalMinutes * 60_000,
          nextRun: existing?.nextRun ?? now + lighthouseStartDelayMs,
        });
      }
    }
    this._tasks = next;
  }

  due(now: number): ScheduledTask[] {
    return this._tasks.filter((t) => t.nextRun <= now);
  }

  markRan(task: ScheduledTask): void {
    task.nextRun = Date.now() + task.intervalMs;
  }

  triggerNow(type: "healthcheck" | "lighthouse", site: string): boolean {
    const task = this._tasks.find((t) => t.type === type && t.site === site);
    if (!task) return false;
    task.nextRun = Date.now();
    return true;
  }

  markRunning(key: string, promise: Promise<void>): void {
    this._inFlight.set(key, promise);
  }

  markDone(key: string): void {
    this._inFlight.delete(key);
    this._progress.delete(key);
  }

  setProgress(key: string, pagesTotal: number): void {
    this._progress.set(key, { pagesCompleted: 0, pagesTotal, startedAt: Date.now() });
  }

  incrementProgress(key: string): void {
    const p = this._progress.get(key);
    if (p) p.pagesCompleted++;
  }

  get taskProgress(): Map<string, { pagesCompleted: number; pagesTotal: number; startedAt: number }> {
    return this._progress;
  }

  isRunning(key: string): boolean {
    return this._inFlight.has(key);
  }

  nextDue(): { task: ScheduledTask; at: number } | null {
    if (this._tasks.length === 0) return null;
    const soonest = this._tasks.reduce((a, b) => (a.nextRun < b.nextRun ? a : b));
    return { task: soonest, at: soonest.nextRun };
  }

  stop(): void {
    this.stopping = true;
  }

  pause(): void { this._paused = true; }
  resume(): void { this._paused = false; }

  get isStopping(): boolean { return this.stopping; }
  get isPaused(): boolean { return this._paused; }

  get taskList(): ScheduledTask[] {
    return this._tasks;
  }

  get runningKeys(): string[] {
    return [...this._inFlight.keys()];
  }

  get inFlightCount(): number {
    return this._inFlight.size;
  }

  get inFlightValues(): Promise<void>[] {
    return [...this._inFlight.values()];
  }

  hasLighthouseRunning(): boolean {
    return [...this._inFlight.keys()].some((k) => k.startsWith("lighthouse:"));
  }
}
