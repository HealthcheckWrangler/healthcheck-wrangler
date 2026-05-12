export interface ScheduledTask {
  type: "healthcheck" | "lighthouse";
  site: string;
  intervalMs: number;
  nextRun: number;
  triggeredAt?: number; // set when manually triggered via "Run now", cleared on completion
}

const MAX_COMPLETIONS = 200;

export class Scheduler {
  private _tasks: ScheduledTask[] = [];
  private _inFlight = new Map<string, Promise<void>>();
  private _progress = new Map<string, { pagesCompleted: number; pagesTotal: number; startedAt: number }>();
  private _completions: { durationMs: number; type: string }[] = [];
  private _queueDepth = 0;
  private stopping = false;
  private _paused = false;

  rebuild(sites: import("./config.js").Site[], lighthouseStartDelayMs: number): void {
    const now = Date.now();
    const next: ScheduledTask[] = [];
    for (const site of sites) {
      if (!site.enabled) continue;
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
    task.triggeredAt = Date.now();
    return true;
  }

  markRunning(key: string, promise: Promise<void>): void {
    this._inFlight.set(key, promise);
  }

  markDone(key: string): void {
    // Record completion duration for throughput estimation
    const progress = this._progress.get(key);
    if (progress) {
      const durationMs = Date.now() - progress.startedAt;
      const type = key.split(":")[0] ?? "healthcheck";
      this._completions.push({ durationMs, type });
      if (this._completions.length > MAX_COMPLETIONS) this._completions.shift();
    }

    this._inFlight.delete(key);
    this._progress.delete(key);

    // Clear the manual trigger flag now that the run has completed
    const [taskType, ...siteParts] = key.split(":");
    const site = siteParts.join(":");
    const task = this._tasks.find((t) => t.type === taskType && t.site === site);
    if (task) task.triggeredAt = undefined;
  }

  setQueueDepth(n: number): void { this._queueDepth = n; }
  get queueDepth(): number { return this._queueDepth; }

  get avgTaskDurationMs(): number {
    if (this._completions.length === 0) return 0;
    const sorted = [...this._completions].map((c) => c.durationMs).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  }

  get completionCount(): number { return this._completions.length; }

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

  get lighthouseInFlightCount(): number {
    return [...this._inFlight.keys()].filter((k) => k.startsWith("lighthouse:")).length;
  }
}
