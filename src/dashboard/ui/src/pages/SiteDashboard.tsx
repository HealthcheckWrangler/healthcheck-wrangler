import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type SiteDetail, type ScheduleTask, type TimelineSeries, type KpiTrendPoint, type LighthouseResult, type LighthouseHistoryPoint } from "../api";
import { LogViewer } from "../components/LogViewer";
import { StateTimeline } from "../components/StateTimeline";
import { SiteHeader, type Tab } from "../components/site/SiteHeader";
import { SiteOverviewTab } from "../components/site/SiteOverviewTab";
import { LighthouseTab } from "../components/site/LighthouseTab";
import { PagesTab } from "../components/site/PagesTab";
import { useTimeRange } from "../lib/time-range";

export function SiteDashboard() {
  const { name } = useParams<{ name: string }>();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [pageSeries, setPageSeries] = useState<TimelineSeries[]>([]);
  const [kpiTrend, setKpiTrend] = useState<KpiTrendPoint[]>([]);
  const [lhHistory, setLhHistory] = useState<LighthouseHistoryPoint[]>([]);
  const [selectedLhPage, setSelectedLhPage] = useState<string>("__all__");
  const [triggering, setTriggering] = useState<"healthcheck" | "lighthouse" | null>(null);
  const { range } = useTimeRange();

  const runNow = async (type: "healthcheck" | "lighthouse") => {
    if (!name || triggering) return;
    setTriggering(type);
    try { await api.trigger(name, type); } finally { setTriggering(null); }
  };

  useEffect(() => {
    if (!name) return;
    const load = () => {
      Promise.all([api.site(name), api.schedule()]).then(([s, sc]) => {
        setSite(s);
        setSchedule(sc.filter((t) => t.site === name));
        setLoading(false);
      }).catch(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [name]);

  useEffect(() => {
    if (!name) return;
    api.siteTimeline(name, range.startMs, range.endMs).then(setPageSeries).catch(() => {});
    api.siteKpiTrend(name, range.startMs, range.endMs).then(setKpiTrend).catch(() => {});
    api.siteLighthouseHistory(name, range.startMs, range.endMs).then((pts) => {
      setLhHistory(pts);
      setSelectedLhPage((prev) => {
        if (prev === "__all__") return "__all__";
        const pages = [...new Set(pts.map((p) => p.page))].sort();
        return pages.includes(prev) ? prev : "__all__";
      });
    }).catch(() => {});
  }, [name, range]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-[hsl(var(--muted-foreground))]">Loading…</div>;
  }

  if (!site) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-[hsl(var(--muted-foreground))]">Site not found</p>
        <Link to="/" className="text-sm text-[hsl(var(--primary))] hover:underline">← Back to overview</Link>
      </div>
    );
  }

  const hcTask = schedule.find((t) => t.type === "healthcheck");
  const lhTask = schedule.find((t) => t.type === "lighthouse");

  const pageEntries = Object.values(site.pageLatest);
  const pagesWithData = pageEntries.filter((p) => p.healthcheck != null);
  const pagesDown = pagesWithData.filter((p) => !p.healthcheck!.up).length;
  const pagesUp = pagesWithData.filter((p) => p.healthcheck!.up).length;
  const totalPages = site.pages.length;
  const avgDuration = pagesWithData.length > 0
    ? pagesWithData.reduce((s, p) => s + p.healthcheck!.durationSeconds, 0) / pagesWithData.length
    : null;

  const siteStatus = hcTask?.running ? "running" : pagesWithData.length === 0 ? "unknown" : pagesDown > 0 ? "down" : "up";
  const latestLh = site.results.lighthouse.at(-1);

  const latestLhPerPage = new Map<string, LighthouseResult>();
  for (const lh of site.results.lighthouse) {
    if (!latestLhPerPage.has(lh.page)) latestLhPerPage.set(lh.page, lh);
  }

  return (
    <div className="flex h-full flex-col">
      <SiteHeader
        site={site}
        siteStatus={siteStatus}
        hcTask={hcTask}
        lhTask={lhTask}
        triggering={triggering}
        onRunNow={runNow}
        tab={tab}
        onTabChange={setTab}
      />

      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <SiteOverviewTab
            pagesUp={pagesUp}
            pagesDown={pagesDown}
            totalPages={totalPages}
            pagesWithData={pagesWithData.length}
            avgDuration={avgDuration}
            kpiTrend={kpiTrend}
            latestLh={latestLh}
          />
        )}

        {tab === "timeline" && (
          <div className="p-6">
            <StateTimeline
              series={pageSeries}
              startMs={range.startMs}
              endMs={range.endMs}
              title={`Page availability (${range.label})`}
            />
          </div>
        )}

        {tab === "lighthouse" && (
          <LighthouseTab
            history={lhHistory}
            selectedPage={selectedLhPage}
            onSelectPage={setSelectedLhPage}
          />
        )}

        {tab === "pages" && (
          <PagesTab
            pages={site.pages}
            pageLatest={site.pageLatest}
            latestLhPerPage={latestLhPerPage}
          />
        )}

        {tab === "logs" && (
          <div className="h-full">
            <LogViewer site={site.name} />
          </div>
        )}
      </div>
    </div>
  );
}
