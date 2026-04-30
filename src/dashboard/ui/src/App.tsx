import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Overview } from "./pages/Overview";
import { SiteDashboard } from "./pages/SiteDashboard";
import { Logs } from "./pages/Logs";
import { api, type RunnerStatus, type Site } from "./api";
import { TimeRangeProvider } from "./lib/time-range";

export function App() {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    const load = () => {
      api.status().then(setStatus).catch(() => setStatus(null));
      api.sites().then(setSites).catch(() => {});
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <BrowserRouter>
      <TimeRangeProvider>
      <Layout status={status} sites={sites}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/sites/:name" element={<SiteDashboard />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </Layout>
      </TimeRangeProvider>
    </BrowserRouter>
  );
}
