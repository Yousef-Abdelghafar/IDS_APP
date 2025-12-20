"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const API_PREDICT = `${BASE_URL}/predict`;
const API_STATS = `${BASE_URL}/stats`;
const API_STATS_RESET = `${BASE_URL}/stats/reset`;
const API_MONITOR_START = `${BASE_URL}/monitor/start`;
const API_MONITOR_STOP = `${BASE_URL}/monitor/stop`;
const API_MONITOR_STATUS = `${BASE_URL}/monitor/status`;

const API_UPLOAD = `${BASE_URL}/upload-dataset/`; // info only (rows/cols)
const API_RECENT_ALERTS = `${BASE_URL}/recent/alerts?limit=10`;

// ✅ new for dataset test
const API_DATASET_TEST = `${BASE_URL}/dataset/test`;
const API_DATASET_TEST_STATUS = `${BASE_URL}/dataset/test/status`;

// (optional visibility)
const API_SOURCE_STATUS = `${BASE_URL}/source/status`;

type PageId = "dashboard" | "live" | "alerts" | "model" | "dataset" | "predict";
type RiskLevel = "High" | "Medium" | "Low";

type StatsResponse = {
  total: number;
  benign: number;
  attack: number;
  benign_pct: number;
  attack_pct: number;
  last_prediction?: { label: string; probability: number };
};

type PredictionResponse = {
  label?: string;
  probability?: number;
  received_features?: Record<string, number>;
  [key: string]: any;
};

type UploadMode = "train" | "test";

type AlertItem = {
  time: string;
  src: string;
  dst: string;
  type: string;
  risk: RiskLevel;
};

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type MonitorStatusResponse = {
  running?: boolean;
  started_at?: string | null;
  stopped_at?: string | null;
  [key: string]: any;
};

type SourceStatusResponse = {
  source?: "generator" | "dataset" | string;
};

type DatasetTestStartResponse = {
  status: string;
  job_id: string;
  rows_detected: number;
  max_rows: number;
  sleep_ms: number;
};

type DatasetTestJob = {
  job_id: string;
  type: string;
  filename: string;
  status: "queued" | "running" | "done" | "failed";
  processed: number;
  total: number;
  benign: number;
  attack: number;
  message?: string | null;
  created_at?: string;
  updated_at?: string;
};

async function safeFetchJSON<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text || `Request failed (${res.status})` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export default function Home() {
  const navItems = useMemo(
    () => [
      { id: "dashboard" as const, label: "Dashboard", emoji: "🏠" },
      { id: "live" as const, label: "Live Traffic", emoji: "📡" },
      { id: "alerts" as const, label: "Alerts", emoji: "🚨" },
      { id: "model" as const, label: "Model", emoji: "📊" },
      { id: "dataset" as const, label: "Dataset", emoji: "📁" },
      { id: "predict" as const, label: "Test API", emoji: "🧪" },
    ],
    []
  );

  const [activePage, setActivePage] = useState<PageId>("dashboard");

  // ===== Stats =====
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  const fetchStats = async () => {
    const r = await safeFetchJSON<StatsResponse>(API_STATS);
    if (r.ok) {
      setStats(r.data);
      setStatsErr(null);
    } else {
      setStatsErr(r.error);
    }
  };

  // ===== Recent Alerts =====
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
  const [recentErr, setRecentErr] = useState<string | null>(null);

  const fetchRecentAlerts = async () => {
    const r = await safeFetchJSON<{ items: AlertItem[] }>(API_RECENT_ALERTS);
    if (r.ok) {
      setRecentAlerts(r.data.items || []);
      setRecentErr(null);
    } else {
      setRecentErr(r.error);
    }
  };

  // ===== Monitoring =====
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState<string | null>(null);
  const [monitorBusy, setMonitorBusy] = useState(false);

  // ✅ Polling refs (علشان نقدر نوقفهم فعلياً)
  const statsIntervalRef = useRef<number | null>(null);
  const alertsIntervalRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (alertsIntervalRef.current) {
      clearInterval(alertsIntervalRef.current);
      alertsIntervalRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    fetchStats();
    fetchRecentAlerts();
    statsIntervalRef.current = window.setInterval(fetchStats, 2000);
    alertsIntervalRef.current = window.setInterval(fetchRecentAlerts, 2000);
  };

  const syncMonitoringFromBackend = async () => {
    const r = await safeFetchJSON<MonitorStatusResponse>(API_MONITOR_STATUS);
    if (r.ok) {
      const running = !!r.data.running;
      setMonitoring(running);

      if (running) {
        startPolling();
      } else {
        stopPolling();
        setRecentAlerts([]);
      }
    } else {
      setMonitorStatus(`⚠️ Could not sync monitoring: ${r.error}`);
    }
  };

  const startMonitoring = async () => {
    setMonitorBusy(true);
    setMonitorStatus(null);

    const r = await safeFetchJSON<any>(API_MONITOR_START);
    if (r.ok) {
      setMonitoring(true);
      setMonitorStatus("✅ Monitoring started.");
      startPolling();
    } else {
      setMonitorStatus(`❌ Start failed: ${r.error}`);
    }

    setMonitorBusy(false);
  };

  const stopMonitoring = async () => {
    setMonitorBusy(true);
    setMonitorStatus(null);

    const r = await safeFetchJSON<any>(API_MONITOR_STOP);
    if (r.ok) {
      setMonitoring(false);
      setMonitorStatus("✅ Monitoring stopped.");
      stopPolling();
      setRecentAlerts([]);
    } else {
      setMonitorStatus(`❌ Stop failed: ${r.error}`);
    }

    setMonitorBusy(false);
  };

  // ✅ Initial load
  useEffect(() => {
    fetchStats();
    fetchRecentAlerts();
    syncMonitoringFromBackend();

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Reset Stats =====
  const [resetBusy, setResetBusy] = useState(false);
  const resetStats = async () => {
    setResetBusy(true);
    const r = await safeFetchJSON<any>(API_STATS_RESET, { method: "POST" });
    if (r.ok) {
      await fetchStats();
      await fetchRecentAlerts();
      setMonitorStatus("✅ Stats reset.");
    } else {
      setMonitorStatus(`❌ Reset failed: ${r.error}`);
    }
    setResetBusy(false);
  };

  // ===== Predict (Test API) =====
  const [jsonInput, setJsonInput] = useState<string>(`{
  "Flow Duration": 12345,
  "Total Fwd Packets": 10,
  "Total Backward Packets": 5
}`);
  const [predBusy, setPredBusy] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

  const runPredict = async () => {
    setPredError(null);
    setPrediction(null);

    let payload: any;
    try {
      payload = JSON.parse(jsonInput);
    } catch {
      setPredError("Invalid JSON.");
      return;
    }

    setPredBusy(true);
    const r = await safeFetchJSON<PredictionResponse>(API_PREDICT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      setPrediction(r.data);
      await fetchStats();
      await fetchRecentAlerts();
    } else {
      setPredError(r.error);
    }

    setPredBusy(false);
  };

  // ===== Upload (Info only) =====
  const [uploadMode, setUploadMode] = useState<UploadMode>("train");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const chooseFile = () => {
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  };

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] ?? null;
    setUploadFile(f);
    setUploadMsg(f ? `Selected: ${f.name}` : "No file selected.");
  };

  const uploadDatasetInfo = async () => {
    if (!uploadFile) {
      setUploadMsg("❌ Select a file first.");
      return;
    }

    setUploadBusy(true);
    setUploadMsg("⏳ Uploading (info)...");

    try {
      const form = new FormData();
      form.append("file", uploadFile);

      const res = await fetch(`${API_UPLOAD}?mode=${uploadMode}`, { method: "POST", body: form });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setUploadMsg(`✅ Info: mode=${data.mode} rows=${data.rows ?? "?"} cols=${data.cols ?? "?"}`);
    } catch (e: any) {
      setUploadMsg(`❌ ${e?.message || "Upload error"}`);
    } finally {
      setUploadBusy(false);
    }
  };

  // ===== Dataset Test (Replay) =====
  const [testMaxRows, setTestMaxRows] = useState<number>(500);
  const [testSleepMs, setTestSleepMs] = useState<number>(0);
  const [testBusy, setTestBusy] = useState(false);
  const [testJobId, setTestJobId] = useState<string | null>(null);
  const [testJob, setTestJob] = useState<DatasetTestJob | null>(null);
  const testPollRef = useRef<number | null>(null);

  const stopTestPolling = () => {
    if (testPollRef.current) {
      clearInterval(testPollRef.current);
      testPollRef.current = null;
    }
  };

  const fetchTestJob = async (jobId: string) => {
    const r = await safeFetchJSON<DatasetTestJob>(`${API_DATASET_TEST_STATUS}?job_id=${encodeURIComponent(jobId)}`);
    if (r.ok) {
      setTestJob(r.data);
      if (r.data.status === "done" || r.data.status === "failed") {
        stopTestPolling();
        setTestBusy(false);
      }
    } else {
      setMonitorStatus(`❌ Test status error: ${r.error}`);
      stopTestPolling();
      setTestBusy(false);
    }
  };

  const runDatasetTest = async () => {
    if (!uploadFile) {
      setUploadMsg("❌ Select a file first.");
      return;
    }
    if (!monitoring) {
      setMonitorStatus("⚠️ Start Monitoring first (required for replay).");
      return;
    }

    setTestBusy(true);
    setTestJob(null);
    setTestJobId(null);
    setMonitorStatus(null);

    try {
      const form = new FormData();
      form.append("file", uploadFile);

      const url = `${API_DATASET_TEST}?max_rows=${encodeURIComponent(String(testMaxRows))}&sleep_ms=${encodeURIComponent(
        String(testSleepMs)
      )}`;

      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Dataset test failed (${res.status})`);
      }
      const data = (await res.json()) as DatasetTestStartResponse;
      setTestJobId(data.job_id);
      setMonitorStatus(`✅ Dataset Test started. job_id=${data.job_id}`);

      // start polling job status
      stopTestPolling();
      await fetchTestJob(data.job_id);
      testPollRef.current = window.setInterval(() => fetchTestJob(data.job_id), 1000);
    } catch (e: any) {
      setTestBusy(false);
      setMonitorStatus(`❌ ${e?.message || "Dataset test error"}`);
    }
  };

  // (optional) show source status
  const [sourceInfo, setSourceInfo] = useState<string | null>(null);
  const fetchSource = async () => {
    const r = await safeFetchJSON<SourceStatusResponse>(API_SOURCE_STATUS);
    if (r.ok) setSourceInfo(r.data.source ?? null);
  };

  useEffect(() => {
    fetchSource();
  }, []);

  useEffect(() => {
    return () => stopTestPolling();
  }, []);

  const lastLabel = stats?.last_prediction?.label ?? "--";
  const lastProb =
    stats?.last_prediction?.probability !== undefined ? stats.last_prediction.probability.toFixed(4) : "--";

  const progressPct =
    testJob && testJob.total > 0 ? Math.round((testJob.processed / testJob.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#020014] text-slate-50">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#0b1020_0,_#020014_55%,_#000_100%)] opacity-90" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-cyan-500/10 bg-black/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/80 to-fuchsia-400/80 text-xs font-bold text-slate-950">
                IDS
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">Intrusion Detection Dashboard</div>
                <div className="text-[0.7rem] text-slate-400">
                  Backend: <span className="text-slate-200">{BASE_URL}</span>
                  {sourceInfo ? <span className="ml-2 text-slate-500">source: {sourceInfo}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <span className={"h-2 w-2 rounded-full " + (monitoring ? "bg-emerald-400" : "bg-slate-500")} />
                {monitoring ? "Monitoring Active" : "Monitoring Paused"}
              </span>
              <span className="hidden sm:inline text-slate-400">
                Last: <span className="text-slate-100">{lastLabel}</span> ({lastProb})
              </span>
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-6 pb-3 md:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {navItems.map((it) => {
                const active = activePage === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setActivePage(it.id)}
                    className={
                      "shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.78rem] " +
                      (active
                        ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                        : "bg-black/30 border-slate-800 text-slate-200 hover:bg-slate-900/50")
                    }
                  >
                    <span>{it.emoji}</span>
                    <span>{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <main className="flex-1 py-6">
          <div className="mx-auto flex max-w-6xl gap-5 px-6">
            <aside className="hidden w-52 shrink-0 flex-col rounded-2xl border border-slate-800 bg-black/70 p-3 md:flex">
              <div className="mb-3 px-2 text-[0.7rem] text-slate-400">Navigation</div>
              <div className="space-y-1">
                {navItems.map((it) => {
                  const active = activePage === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setActivePage(it.id)}
                      className={
                        "w-full rounded-xl px-3 py-2 text-left text-[0.8rem] flex items-center gap-2 border " +
                        (active
                          ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                          : "border-transparent text-slate-300 hover:bg-slate-900/70 hover:border-slate-700")
                      }
                    >
                      <span>{it.emoji}</span>
                      <span>{it.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                <div className="text-[0.7rem] text-slate-400">Quick Control</div>
                <div className="mt-3 flex flex-col gap-2">
                  <PrimaryBtn onClick={startMonitoring} disabled={monitorBusy || monitoring} label="Start Monitoring" />
                  <GhostBtn onClick={stopMonitoring} disabled={monitorBusy || !monitoring} label="Stop Monitoring" />
                  <DangerBtn onClick={resetStats} disabled={resetBusy} label="Reset Stats" />
                </div>
              </div>
            </aside>

            <section className="flex-1">
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Total Flows" value={stats ? String(stats.total) : "--"} accent="fuchsia" />
                <MetricTile
                  label="BENIGN"
                  value={stats ? `${stats.benign} (${stats.benign_pct}%)` : "--"}
                  accent="cyan"
                />
                <MetricTile
                  label="ATTACK"
                  value={stats ? `${stats.attack} (${stats.attack_pct}%)` : "--"}
                  accent="emerald"
                />
              </div>

              {statsErr && <Notice tone="warn">Stats fetch warning: {statsErr}</Notice>}
              {monitorStatus && <Notice tone="warn">{monitorStatus}</Notice>}
              {recentErr && <Notice tone="warn">Recent alerts warning: {recentErr}</Notice>}

              {activePage === "dashboard" && (
                <div className="grid gap-6 lg:grid-cols-[1.7fr,1.3fr]">
                  <div className="flex flex-col gap-6">
                    <NeonCard title="Control Panel" rightLabel="Real buttons">
                      <div className="flex flex-wrap gap-2">
                        <PrimaryBtn
                          onClick={startMonitoring}
                          disabled={monitorBusy || monitoring}
                          label={monitoring ? "Monitoring Active" : "Start Monitoring"}
                        />
                        <GhostBtn onClick={stopMonitoring} disabled={monitorBusy || !monitoring} label="Stop Monitoring" />
                        <DangerBtn
                          onClick={resetStats}
                          disabled={resetBusy}
                          label={resetBusy ? "Resetting..." : "Reset Stats"}
                        />
                      </div>
                    </NeonCard>

                    <NeonCard title="Recent Alerts (LIVE)" rightLabel="from /recent/alerts">
                      {!monitoring ? (
                        <div className="text-xs text-slate-400">
                          Monitoring is paused. Start monitoring to see live alerts.
                        </div>
                      ) : recentAlerts.length === 0 ? (
                        <div className="text-xs text-slate-400">No alerts yet.</div>
                      ) : (
                        <div className="overflow-x-auto text-xs">
                          <table className="w-full text-left">
                            <thead className="border-b border-slate-800/80 text-slate-400">
                              <tr>
                                <th className="py-1.5 font-medium">Time</th>
                                <th className="py-1.5 font-medium">Source</th>
                                <th className="py-1.5 font-medium">Dest</th>
                                <th className="py-1.5 font-medium">Type</th>
                                <th className="py-1.5 font-medium">Risk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentAlerts.map((a, idx) => (
                                <tr key={idx} className="border-b border-slate-900/70">
                                  <td className="py-1.5 text-slate-200">{a.time}</td>
                                  <td className="py-1.5 text-slate-200">{a.src}</td>
                                  <td className="py-1.5 text-slate-200">{a.dst}</td>
                                  <td className="py-1.5 text-slate-200">{a.type}</td>
                                  <td className="py-1.5">
                                    <RiskPill risk={a.risk} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </NeonCard>
                  </div>

                  <div className="flex flex-col gap-6">
                    <NeonCard title="Quick Actions" rightLabel="Shortcuts">
                      <div className="flex flex-wrap gap-2">
                        <PrimaryBtn onClick={() => setActivePage("predict")} label="Go to Test API" />
                        <GhostBtn onClick={() => setActivePage("dataset")} label="Go to Dataset" />
                        <GhostBtn onClick={() => (monitoring ? fetchStats() : syncMonitoringFromBackend())} label="Refresh" />
                      </div>
                    </NeonCard>

                    <NeonCard title="Live Snapshot" rightLabel="/stats">
                      <div className="rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                        <pre className="whitespace-pre-wrap break-words text-slate-100">
                          {stats ? JSON.stringify(stats, null, 2) : "--"}
                        </pre>
                      </div>
                    </NeonCard>
                  </div>
                </div>
              )}

              {activePage === "dataset" && (
                <NeonCard title="Dataset Manager" rightLabel="Upload info + Replay test">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-400">Mode (info only):</span>
                    <button
                      type="button"
                      onClick={() => setUploadMode("train")}
                      className={
                        "rounded-full border px-3 py-1 text-[0.75rem] " +
                        (uploadMode === "train"
                          ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                      }
                    >
                      Train
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("test")}
                      className={
                        "rounded-full border px-3 py-1 text-[0.75rem] " +
                        (uploadMode === "test"
                          ? "bg-fuchsia-500/20 border-fuchsia-400/70 text-fuchsia-100"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                      }
                    >
                      Test
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <PrimaryBtn onClick={chooseFile} disabled={uploadBusy || testBusy} label="Select File" />
                    <GhostBtn
                      onClick={uploadDatasetInfo}
                      disabled={uploadBusy || testBusy}
                      label={uploadBusy ? "Uploading..." : "Upload Info"}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                    <div className="text-[0.72rem] text-slate-400">Dataset Test (Replay to Dashboard)</div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-400">max_rows</span>
                      <input
                        className="w-28 rounded-lg border border-slate-700 bg-black px-2 py-1 text-slate-100 outline-none"
                        type="number"
                        value={testMaxRows}
                        min={1}
                        max={50000}
                        onChange={(e) => setTestMaxRows(Number(e.target.value))}
                      />
                      <span className="text-slate-400">sleep_ms</span>
                      <input
                        className="w-28 rounded-lg border border-slate-700 bg-black px-2 py-1 text-slate-100 outline-none"
                        type="number"
                        value={testSleepMs}
                        min={0}
                        max={1000}
                        onChange={(e) => setTestSleepMs(Number(e.target.value))}
                      />
                      <span className="text-slate-500">(use 50~200 for “real-time feel”)</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <PrimaryBtn
                        onClick={runDatasetTest}
                        disabled={testBusy || uploadBusy}
                        label={testBusy ? "Running Replay..." : "Run Dataset Test (Replay)"}
                      />
                      <GhostBtn onClick={fetchSource} disabled={false} label="Refresh Source" />
                    </div>

                    {testJobId && (
                      <div className="text-slate-200">
                        job_id: <span className="text-slate-100">{testJobId}</span>
                      </div>
                    )}

                    {testJob && (
                      <div className="rounded-xl border border-slate-800 bg-black/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-slate-200">
                            Status: <span className="text-slate-100">{testJob.status}</span>
                            {testJob.message ? <span className="ml-2 text-slate-400">({testJob.message})</span> : null}
                          </div>
                          <div className="text-slate-300">
                            {testJob.processed}/{testJob.total} ({progressPct}%)
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-900">
                          <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${progressPct}%` }} />
                        </div>
                        <div className="mt-2 text-slate-300">
                          benign: {testJob.benign} | attack: {testJob.attack}
                        </div>
                        <div className="mt-1 text-slate-500 text-[0.72rem]">
                        
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.parquet,.json"
                    className="hidden"
                    onChange={onFileChange}
                  />

                  {uploadMsg && (
                    <div className="mt-3 rounded-xl border border-slate-800 bg-black/60 p-3 text-xs text-slate-200">
                      {uploadMsg}
                    </div>
                  )}
                </NeonCard>
              )}

              {activePage === "predict" && (
                <NeonCard title="Test API" rightLabel="POST /predict">
                  <label className="text-[0.78rem] text-slate-200">JSON Input</label>
                  <textarea
                    className="mt-2 min-h-[160px] w-full rounded-xl border border-cyan-500/40 bg-black/70 px-3 py-2 text-xs font-mono text-cyan-100 outline-none"
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PrimaryBtn
                      onClick={runPredict}
                      disabled={predBusy}
                      label={predBusy ? "Predicting..." : "Run Prediction"}
                    />
                    <GhostBtn
                      onClick={() => (monitoring ? fetchStats() : syncMonitoringFromBackend())}
                      label="Refresh"
                    />
                    <DangerBtn onClick={resetStats} disabled={resetBusy} label="Reset Stats" />
                  </div>

                  {predError && <Notice tone="error">Error: {predError}</Notice>}

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                      <div className="mb-2 text-[0.72rem] text-slate-400">Prediction Response</div>
                      <pre className="whitespace-pre-wrap break-words text-slate-100">
                        {prediction ? JSON.stringify(prediction, null, 2) : "--"}
                      </pre>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                      <div className="mb-2 text-[0.72rem] text-slate-400">Live Stats</div>
                      <pre className="whitespace-pre-wrap break-words text-slate-100">
                        {stats ? JSON.stringify(stats, null, 2) : "--"}
                      </pre>
                    </div>
                  </div>
                </NeonCard>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/* UI */
function NeonCard({ title, rightLabel, children }: { title: string; rightLabel?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/75 p-5 shadow-[0_0_35px_rgba(15,23,42,0.55)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-50">{title}</h2>
        {rightLabel && <span className="text-[0.7rem] text-slate-400">{rightLabel}</span>}
      </div>
      {children}
    </div>
  );
}

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "cyan" | "fuchsia" | "indigo" | "emerald";
}) {
  const map: Record<string, string> = {
    cyan: "border-cyan-500/60 text-cyan-200",
    fuchsia: "border-fuchsia-500/60 text-fuchsia-200",
    indigo: "border-indigo-500/60 text-indigo-200",
    emerald: "border-emerald-500/60 text-emerald-200",
  };
  return (
    <div className={"rounded-xl border bg-black/70 px-3 py-3 " + map[accent]}>
      <div className="text-[0.7rem] text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function RiskPill({ risk }: { risk: RiskLevel }) {
  const cls =
    risk === "High"
      ? "border-red-400/70 bg-red-500/20 text-red-200"
      : risk === "Medium"
      ? "border-amber-400/70 bg-amber-500/20 text-amber-200"
      : "border-emerald-400/70 bg-emerald-500/20 text-emerald-200";
  return <span className={"rounded-full border px-2 py-0.5 text-[0.7rem] " + cls}>{risk}</span>;
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
      : "border-rose-500/40 bg-rose-950/20 text-rose-200";
  return <div className={"mb-5 rounded-xl border px-4 py-3 text-xs " + cls}>{children}</div>;
}

function PrimaryBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-cyan-400/80 bg-cyan-500 px-4 py-1.5 text-[0.75rem] font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-cyan-400 hover:border-cyan-300"
    >
      {label}
    </button>
  );
}

function GhostBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-[0.75rem] text-slate-100 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-800 hover:border-slate-500"
    >
      {label}
    </button>
  );
}

function DangerBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-rose-400/70 bg-rose-500/20 px-4 py-1.5 text-[0.75rem] text-rose-200 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-rose-500/30 hover:border-rose-300"
    >
      {label}
    </button>
  );
}
