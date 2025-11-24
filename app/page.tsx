"use client";

import React, { useState, useRef } from "react";

const API_URL = "http://127.0.0.1:8000/predict";
const UPLOAD_URL = "http://127.0.0.1:8000/upload-dataset";

type RiskLevel = "High" | "Medium" | "Low";
type UploadMode = "train" | "test";
type PageId = "dashboard" | "live-traffic" | "alerts" | "model" | "dataset" | "predict";

type AlertItem = {
  time: string;
  src: string;
  dst: string;
  type: string;
  risk: RiskLevel;
};

type ModelMetrics = {
  accuracy: string;
  precision: string;
  recall: string;
  f1: string;
  type: string;
  lastRetrain: string;
};

type PredictionResponse = {
  label?: string;
  probability?: number;
  [key: string]: any;
};

export default function Home() {
  const [activePage, setActivePage] = useState<PageId>("dashboard");

  const [jsonInput, setJsonInput] = useState<string>(`{
  "Flow_Duration": 12345,
  "Tot_Fwd_Pkts": 10,
  "Tot_Bwd_Pkts": 5
}`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

  const [monitoring, setMonitoring] = useState(false);
  const [retraining, setRetraining] = useState(false);

  const [monitorStatus, setMonitorStatus] = useState<string | null>(null);
  const [datasetStatus, setDatasetStatus] = useState<string | null>(null);

  const [uploadMode, setUploadMode] = useState<UploadMode>("train");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const alertsTimeline: number[] = [10, 15, 22, 19, 28, 20, 25];
  const maxVal = Math.max(...alertsTimeline);

  const recentAlerts: AlertItem[] = [
    {
      time: "12:02",
      src: "192.168.1.12",
      dst: "192.168.1.11",
      type: "DDoS",
      risk: "High",
    },
    {
      time: "12:01",
      src: "192.168.1.10",
      dst: "192.168.1.100",
      type: "Brute Force",
      risk: "Medium",
    },
    {
      time: "11:59",
      src: "10.0.0.5",
      dst: "10.0.0.10",
      type: "Port Scan",
      risk: "Low",
    },
  ];

  const modelMetrics: ModelMetrics = {
    accuracy: "98%",
    precision: "96%",
    recall: "94%",
    f1: "96%",
    type: "XGBoost",
    lastRetrain: "23/11/2025",
  };

  const handlePredict = async () => {
    setError(null);
    setPrediction(null);

    let payload: any;
    try {
      payload = JSON.parse(jsonInput);
    } catch {
      setError("Invalid JSON format.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error (${res.status}): ${text}`);
      }

      const data = await res.json();
      setPrediction(data);
    } catch (err: any) {
      setError(err.message ?? "Error while calling API.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartMonitoring = () => {
    setMonitoring(true);
    setMonitorStatus("Monitoring started.");
  };

  const handleStopMonitoring = () => {
    setMonitoring(false);
    setMonitorStatus("Monitoring stopped.");
  };

  const handleRetrainModel = () => {
    if (retraining) return;
    setRetraining(true);
    setMonitorStatus("Retraining model (demo only, front-end state).");
    setTimeout(() => {
      setRetraining(false);
      setMonitorStatus("Retraining finished (demo).");
    }, 3000);
  };

  const handleSelectFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    if (file) {
      setDatasetStatus(
        `Selected file: ${file.name} (${uploadMode.toUpperCase()} mode).`
      );
    } else {
      setDatasetStatus("No file selected.");
    }
  };

  const handleUploadDataset = async () => {
    if (!uploadFile) {
      setDatasetStatus("Please select a dataset first.");
      return;
    }

    try {
      setUploading(true);
      setDatasetStatus(
        uploadMode === "train"
          ? "Uploading training dataset and retraining model..."
          : "Uploading dataset and running batch analysis..."
      );

      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch(`${UPLOAD_URL}?mode=${uploadMode}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload API error (${res.status}): ${text}`);
      }

      const data = await res.json();
      setDatasetStatus(
        uploadMode === "train"
          ? `Training dataset processed. Rows: ${data.rows ?? "?"}, model may be retrained.`
          : `Analysis completed. Processed rows: ${data.rows ?? "?"}.`
      );
    } catch (err: any) {
      setDatasetStatus(err.message ?? "Error while uploading dataset.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020014] text-slate-50">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#0b1020_0,_#020014_55%,_#000_100%)] opacity-90" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="border-b border-cyan-500/10 bg-black/60 backdrop-blur">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-400/80 to-fuchsia-400/80 flex items-center justify-center text-xs font-bold text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                IDS
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">
                  Intrusion Detection Dashboard
                </div>
                <div className="text-[0.7rem] text-slate-400">
                  Network Security Overview
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1 text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                <span>Model Online</span>
              </div>
              <div className="flex items-center gap-1 text-slate-300">
                <span
                  className={
                    "h-2 w-2 rounded-full " +
                    (monitoring
                      ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"
                      : "bg-slate-500")
                  }
                />
                <span>
                  {monitoring ? "Monitoring Active" : "Monitoring Paused"}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6">
          <div className="max-w-6xl mx-auto px-6 flex gap-5">
            <Sidebar activePage={activePage} onChange={setActivePage} />

            <div className="flex-1">
              {activePage === "dashboard" && (
                <DashboardView
                  alertsTimeline={alertsTimeline}
                  maxVal={maxVal}
                  recentAlerts={recentAlerts}
                  monitoring={monitoring}
                  retraining={retraining}
                  monitorStatus={monitorStatus}
                  handleStartMonitoring={handleStartMonitoring}
                  handleStopMonitoring={handleStopMonitoring}
                  handleRetrainModel={handleRetrainModel}
                />
              )}

              {activePage === "live-traffic" && <LiveTrafficView />}

              {activePage === "alerts" && (
                <AlertsView
                  alertsTimeline={alertsTimeline}
                  maxVal={maxVal}
                  recentAlerts={recentAlerts}
                />
              )}

              {activePage === "dataset" && (
                <DatasetView
                  uploadMode={uploadMode}
                  setUploadMode={setUploadMode}
                  handleSelectFileClick={handleSelectFileClick}
                  handleUploadDataset={handleUploadDataset}
                  uploading={uploading}
                  datasetStatus={datasetStatus}
                  fileInputRef={fileInputRef}
                  handleFileChange={handleFileChange}
                />
              )}

              {activePage === "model" && (
                <ModelAnalyticsView modelMetrics={modelMetrics} />
              )}

              {activePage === "predict" && (
                <PredictView
                  jsonInput={jsonInput}
                  setJsonInput={setJsonInput}
                  handlePredict={handlePredict}
                  loading={loading}
                  error={error}
                  prediction={prediction}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

type SidebarProps = {
  activePage: PageId;
  onChange: (page: PageId) => void;
};

function Sidebar({ activePage, onChange }: SidebarProps) {
  const items: { id: PageId; label: string; emoji: string }[] = [
    { id: "dashboard", label: "Dashboard", emoji: "🏠" },
    { id: "live-traffic", label: "Live Traffic", emoji: "📡" },
    { id: "alerts", label: "Alerts", emoji: "🚨" },
    { id: "model", label: "Model Analytics", emoji: "📊" },
    { id: "dataset", label: "Dataset Manager", emoji: "📁" },
    { id: "predict", label: "Test API", emoji: "🧪" },
  ];

  return (
    <aside className="hidden md:flex flex-col w-52 rounded-2xl border border-slate-800 bg-black/70 shadow-[0_0_35px_rgba(15,23,42,0.9)] p-3 text-sm">
      <div className="mb-3 text-[0.7rem] text-slate-400 px-2">Navigation</div>
      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={
                "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[0.8rem] " +
                (active
                  ? "bg-cyan-500/20 border border-cyan-400/70 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.7)]"
                  : "bg-transparent border border-transparent text-slate-300 hover:bg-slate-900/70 hover:border-slate-700")
              }
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

type DashboardViewProps = {
  alertsTimeline: number[];
  maxVal: number;
  recentAlerts: AlertItem[];
  monitoring: boolean;
  retraining: boolean;
  monitorStatus: string | null;
  handleStartMonitoring: () => void;
  handleStopMonitoring: () => void;
  handleRetrainModel: () => void;
};

function DashboardView({
  alertsTimeline,
  maxVal,
  recentAlerts,
  monitoring,
  retraining,
  monitorStatus,
  handleStartMonitoring,
  handleStopMonitoring,
  handleRetrainModel,
}: DashboardViewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.7fr,1.3fr]">
      <section className="flex flex-col gap-6">
        <NeonCard title="Network Flow Map">
          <div className="flex gap-4">
            <div className="w-60 rounded-xl bg-black/70 border border-cyan-500/40 shadow-[0_0_20px_rgba(34,211,238,0.4)] px-3 py-3 text-xs">
              <div className="font-semibold text-cyan-200 mb-1">
                Node 192.168.1.12
              </div>
              <Row label="Sent Packets/sec" value="522" />
              <Row label="Received Packets/sec" value="1,289" />
              <Row label="Protocols" value="TCP · ICMP" />
              <div className="flex justify-between items-center mt-1">
                <span className="text-slate-400">Risk Level</span>
                <span className="px-2 py-0.5 rounded-full text-[0.7rem] bg-amber-500/20 text-amber-300 border border-amber-400/60">
                  Suspicious
                </span>
              </div>
            </div>

            <div className="flex-1 rounded-xl border border-cyan-500/20 bg-gradient-to-tr from-slate-950/80 via-slate-950/95 to-[#050018] shadow-[0_0_35px_rgba(34,211,238,0.2)] p-3">
              <svg viewBox="0 0 400 200" className="w-full h-52">
                <path
                  d="M60 60 C130 40 200 60 260 70"
                  className="stroke-cyan-300/90 stroke-[2.2] fill-none"
                />
                <path
                  d="M60 140 C140 130 200 120 260 110"
                  className="stroke-sky-500/90 stroke-[2.1] fill-none"
                />
                <path
                  d="M260 70 C300 100 320 140 340 170"
                  className="stroke-amber-400/95 stroke-[2.4] fill-none"
                />
                <path
                  d="M260 110 C300 120 320 90 350 60"
                  className="stroke-fuchsia-400/90 stroke-[2.1] fill-none"
                />
                <circle cx="60" cy="60" r="7.5" className="fill-cyan-300" />
                <circle cx="60" cy="140" r="7.5" className="fill-cyan-300" />
                <circle cx="210" cy="90" r="10" className="fill-emerald-400" />
                <circle cx="260" cy="70" r="7.5" className="fill-cyan-300" />
                <circle cx="260" cy="110" r="7.5" className="fill-cyan-300" />
                <circle cx="340" cy="170" r="9" className="fill-amber-400" />
                <circle cx="350" cy="60" r="7.5" className="fill-fuchsia-400" />
              </svg>
            </div>
          </div>
        </NeonCard>

        <NeonCard title="Alerts Timeline (Last 24h)">
          <div className="rounded-2xl border border-fuchsia-500/25 bg-slate-950/80 px-4 pt-2 pb-4 shadow-[0_0_35px_rgba(162,28,175,0.55)]">
            <svg viewBox="0 0 400 160" className="w-full h-40">
              <line
                x1="40"
                y1="130"
                x2="370"
                y2="130"
                className="stroke-slate-700 stroke-[1]"
              />
              <line
                x1="40"
                y1="20"
                x2="40"
                y2="130"
                className="stroke-slate-700 stroke-[1]"
              />
              <polyline
                className="fill-none stroke-emerald-400 stroke-[2.3]"
                points={alertsTimeline
                  .map((v, i) => {
                    const x = 40 + (i * (330 / (alertsTimeline.length - 1)));
                    const y = 130 - (v / maxVal) * 100;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
              {alertsTimeline.map((v, i) => {
                const x = 40 + (i * (330 / (alertsTimeline.length - 1)));
                const y = 130 - (v / maxVal) * 100;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="3.8"
                    className="fill-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]"
                  />
                );
              })}
            </svg>
            <p className="mt-1 text-[0.7rem] text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
              Alerts
            </p>
          </div>
        </NeonCard>

        <NeonCard title="Control Panel">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={handleStartMonitoring}
              disabled={monitoring}
              className="px-4 py-1.5 rounded-full bg-cyan-500 text-[0.75rem] font-medium text-slate-950 border border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.9)] disabled:opacity-50 hover:bg-cyan-400 hover:border-cyan-300"
            >
              {monitoring ? "Monitoring Active" : "Start Monitoring"}
            </button>
            <button
              onClick={handleStopMonitoring}
              disabled={!monitoring}
              className="px-4 py-1.5 rounded-full bg-slate-900 text-[0.75rem] text-slate-100 border border-slate-700 disabled:opacity-50 hover:bg-slate-800 hover:border-slate-500"
            >
              Stop Monitoring
            </button>
            <button
              onClick={handleRetrainModel}
              disabled={retraining}
              className="px-4 py-1.5 rounded-full bg-slate-900 text-[0.75rem] text-slate-100 border border-slate-700 disabled:opacity-50 hover:bg-slate-800 hover:border-slate-500"
            >
              {retraining ? "Retraining..." : "Retrain Model"}
            </button>
          </div>

          {monitorStatus && (
            <div className="mt-1 rounded-lg border border-slate-700 bg-black/70 px-3 py-2 text-[0.75rem] text-slate-100">
              {monitorStatus}
            </div>
          )}
        </NeonCard>
      </section>

      <section className="flex flex-col gap-6">
        <NeonCard title="Network Snapshot">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <MetricTile label="Packets/sec" value="12,480" accent="cyan" />
            <MetricTile label="Active Connections" value="142" accent="fuchsia" />
            <MetricTile label="Bandwidth Usage" value="512 Mbps" accent="indigo" />
            <MetricTile label="Suspicious Flows" value="4" accent="emerald" />
          </div>
        </NeonCard>

        <NeonCard title="Recent Alerts" rightLabel="Auto update: 5s">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-slate-400 border-b border-slate-800/80">
                <tr>
                  <th className="py-1.5 font-medium">Time</th>
                  <th className="py-1.5 font-medium">Source IP</th>
                  <th className="py-1.5 font-medium">Destination IP</th>
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
        </NeonCard>
      </section>
    </div>
  );
}

function LiveTrafficView() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr,1.5fr]">
      <section className="flex flex-col gap-6">
        <NeonCard title="Live Network Flow">
          <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-tr from-slate-950/80 via-slate-950/90 to-[#050018] px-5 py-4 shadow-[0_0_40px_rgba(8,47,73,0.7)]">
            <div className="relative">
              <svg viewBox="0 0 400 200" className="w-full h-52">
                <path
                  d="M60 60 C130 40 200 60 260 70"
                  className="stroke-cyan-300/90 stroke-[2.2] fill-none"
                />
                <path
                  d="M60 140 C140 130 200 120 260 110"
                  className="stroke-sky-500/90 stroke-[2.1] fill-none"
                />
                <path
                  d="M260 70 C300 100 320 140 340 170"
                  className="stroke-amber-400/95 stroke-[2.4] fill-none"
                />
                <path
                  d="M260 110 C300 120 320 90 350 60"
                  className="stroke-fuchsia-400/90 stroke-[2.1] fill-none"
                />
                <circle cx="60" cy="60" r="7.5" className="fill-cyan-300" />
                <circle cx="60" cy="140" r="7.5" className="fill-cyan-300" />
                <circle cx="210" cy="90" r="10" className="fill-emerald-400" />
                <circle cx="260" cy="70" r="7.5" className="fill-cyan-300" />
                <circle cx="260" cy="110" r="7.5" className="fill-cyan-300" />
                <circle cx="340" cy="170" r="9" className="fill-amber-400" />
                <circle cx="350" cy="60" r="7.5" className="fill-fuchsia-400" />
              </svg>
            </div>
          </div>
        </NeonCard>
      </section>

      <section className="flex flex-col gap-6">
        <NeonCard title="Network Snapshot">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <MetricTile label="Packets/sec" value="12,480" accent="cyan" />
            <MetricTile label="Active Connections" value="142" accent="fuchsia" />
            <MetricTile label="Bandwidth Usage" value="512 Mbps" accent="indigo" />
            <MetricTile label="Suspicious Flows" value="4" accent="emerald" />
          </div>
        </NeonCard>
      </section>
    </div>
  );
}

type AlertsViewProps = {
  alertsTimeline: number[];
  maxVal: number;
  recentAlerts: AlertItem[];
};

function AlertsView({ alertsTimeline, maxVal, recentAlerts }: AlertsViewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr,1.5fr]">
      <section className="flex flex-col gap-6">
        <NeonCard title="Alerts Timeline (Last 24h)">
          <div className="rounded-2xl border border-fuchsia-500/25 bg-slate-950/80 px-4 pt-2 pb-4 shadow-[0_0_35px_rgba(162,28,175,0.55)]">
            <svg viewBox="0 0 400 160" className="w-full h-40">
              <line
                x1="40"
                y1="130"
                x2="370"
                y2="130"
                className="stroke-slate-700 stroke-[1]"
              />
              <line
                x1="40"
                y1="20"
                x2="40"
                y2="130"
                className="stroke-slate-700 stroke-[1]"
              />
              <polyline
                className="fill-none stroke-emerald-400 stroke-[2.3]"
                points={alertsTimeline
                  .map((v, i) => {
                    const x = 40 + (i * (330 / (alertsTimeline.length - 1)));
                    const y = 130 - (v / maxVal) * 100;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
              {alertsTimeline.map((v, i) => {
                const x = 40 + (i * (330 / (alertsTimeline.length - 1)));
                const y = 130 - (v / maxVal) * 100;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="3.8"
                    className="fill-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]"
                  />
                );
              })}
            </svg>
            <p className="mt-1 text-[0.7rem] text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
              Alerts
            </p>
          </div>
        </NeonCard>
      </section>

      <section className="flex flex-col gap-6">
        <NeonCard title="Recent Alerts" rightLabel="Auto update: 5s">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-slate-400 border-b border-slate-800/80">
                <tr>
                  <th className="py-1.5 font-medium">Time</th>
                  <th className="py-1.5 font-medium">Source IP</th>
                  <th className="py-1.5 font-medium">Destination IP</th>
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
        </NeonCard>
      </section>
    </div>
  );
}

type DatasetViewProps = {
  uploadMode: UploadMode;
  setUploadMode: (mode: UploadMode) => void;
  handleSelectFileClick: () => void;
  handleUploadDataset: () => void;
  uploading: boolean;
  datasetStatus: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileChange: React.ChangeEventHandler<HTMLInputElement>;
};

function DatasetView({
  uploadMode,
  setUploadMode,
  handleSelectFileClick,
  handleUploadDataset,
  uploading,
  datasetStatus,
  fileInputRef,
  handleFileChange,
}: DatasetViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <NeonCard title="Dataset Management">
        <div className="flex flex-col gap-2 text-[0.7rem]">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-slate-400">Dataset mode:</span>
            <button
              type="button"
              onClick={() => setUploadMode("train")}
              className={
                "px-3 py-1 rounded-full border text-[0.7rem] " +
                (uploadMode === "train"
                  ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
              }
            >
              Train model
            </button>
            <button
              type="button"
              onClick={() => setUploadMode("test")}
              className={
                "px-3 py-1 rounded-full border text-[0.7rem] " +
                (uploadMode === "test"
                  ? "bg-fuchsia-500/20 border-fuchsia-400/70 text-fuchsia-100"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
              }
            >
              Analyze dataset
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSelectFileClick}
              className="px-4 py-1.5 rounded-full bg-slate-900 border border-fuchsia-500/40 text-fuchsia-200 hover:bg-slate-800 hover:border-fuchsia-300"
            >
              Select Dataset
            </button>
            <button
              type="button"
              onClick={handleUploadDataset}
              disabled={uploading}
              className="px-4 py-1.5 rounded-full bg-slate-900 border border-emerald-500/40 text-emerald-200 hover:bg-slate-800 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading
                ? uploadMode === "train"
                  ? "Uploading & Training..."
                  : "Uploading & Analyzing..."
                : "Upload Dataset"}
            </button>
          </div>

          {datasetStatus && (
            <div className="mt-2 rounded-lg border border-slate-700 bg-black/70 px-3 py-2 text-[0.75rem] text-slate-100">
              {datasetStatus}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.parquet,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </NeonCard>
    </div>
  );
}

type ModelAnalyticsViewProps = {
  modelMetrics: ModelMetrics;
};

function ModelAnalyticsView({ modelMetrics }: ModelAnalyticsViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <NeonCard title="Model Analytics">
        <div className="grid gap-4 md:grid-cols-[1.05fr,1.6fr] text-xs">
          <div className="space-y-1.5">
            <Row label="Accuracy" value={modelMetrics.accuracy} />
            <Row label="Precision" value={modelMetrics.precision} />
            <Row label="Recall" value={modelMetrics.recall} />
            <Row label="F1-Score" value={modelMetrics.f1} />
            <Row label="Model Type" value={modelMetrics.type} />
            <Row label="Last Retrain" value={modelMetrics.lastRetrain} />
          </div>

          <div className="space-y-2 text-[0.8rem] text-slate-300">
            <p>
              The current model is an XGBoost-based classifier optimized for
              intrusion detection over flow-level features. It is tuned to
              maximize F1-score while keeping a high recall to reduce the risk
              of missing attacks.
            </p>
            <p>
              Accuracy and precision are both above 95%, which indicates
              balanced performance on both benign and malicious traffic in the
              validation dataset.
            </p>
          </div>
        </div>
      </NeonCard>
    </div>
  );
}

type PredictViewProps = {
  jsonInput: string;
  setJsonInput: (value: string) => void;
  handlePredict: () => void;
  loading: boolean;
  error: string | null;
  prediction: PredictionResponse | null;
};

function PredictView({
  jsonInput,
  setJsonInput,
  handlePredict,
  loading,
  error,
  prediction,
}: PredictViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <NeonCard title="Model Inference">
        <div className="space-y-2 text-xs">
          <label className="text-[0.78rem] text-slate-200">
            Test Prediction (JSON Input)
          </label>
          <textarea
            className="w-full min-h-[130px] rounded-xl border border-cyan-500/40 bg-black/70 px-2.5 py-2 text-xs font-mono text-cyan-100 focus:outline-none focus:ring-1 focus:ring-cyan-400 shadow-[0_0_18px_rgba(8,47,73,0.7)]"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          <p className="text-[0.7rem] text-slate-400">
            Example keys: Flow_Duration, Tot_Fwd_Pkts, Tot_Bwd_Pkts. Use the
            same feature names as in the training dataset.
          </p>
          <button
            onClick={handlePredict}
            disabled={loading}
            className="w-full mt-1 inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-xs font-medium text-slate-950 border border-cyan-400/80 disabled:opacity-60 shadow-[0_0_25px_rgba(34,211,238,0.8)] hover:from-cyan-400 hover:to-fuchsia-400 hover:border-cyan-300"
          >
            {loading ? "Predicting..." : "Run Prediction"}
          </button>

          {error && (
            <div className="mt-2 rounded-lg border border-red-500/60 bg-red-950/70 px-2 py-1.5 text-[0.75rem] text-red-100">
              <strong>Error:</strong> {error}
            </div>
          )}

          {prediction && (
            <div className="mt-2 rounded-lg border border-slate-700 bg-black/70 px-2 py-1.5 text-[0.75rem]">
              <div className="font-semibold mb-1 text-cyan-200">
                API Response
              </div>
              <pre className="whitespace-pre-wrap break-words text-slate-100">
                {JSON.stringify(prediction, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </NeonCard>
    </div>
  );
}

type NeonCardProps = {
  title: string;
  children: React.ReactNode;
  rightLabel?: string;
};

function NeonCard({ title, children, rightLabel }: NeonCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/75 shadow-[0_0_35px_rgba(15,23,42,0.9)] p-5 mb-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-slate-50">
          {title}
        </h2>
        {rightLabel && (
          <span className="text-[0.7rem] text-slate-400">{rightLabel}</span>
        )}
      </div>
      {children}
    </div>
  );
}

type MetricTileProps = {
  label: string;
  value: string;
  accent: "cyan" | "fuchsia" | "indigo" | "emerald";
};

function MetricTile({ label, value, accent }: MetricTileProps) {
  const accentMap: Record<
    MetricTileProps["accent"],
    { border: string; text: string; glow: string }
  > = {
    cyan: {
      border: "border-cyan-500/60",
      text: "text-cyan-200",
      glow: "shadow-[0_0_22px_rgba(34,211,238,0.7)]",
    },
    fuchsia: {
      border: "border-fuchsia-500/60",
      text: "text-fuchsia-200",
      glow: "shadow-[0_0_22px_rgba(232,121,249,0.7)]",
    },
    indigo: {
      border: "border-indigo-500/60",
      text: "text-indigo-200",
      glow: "shadow-[0_0_22px_rgba(129,140,248,0.7)]",
    },
    emerald: {
      border: "border-emerald-500/60",
      text: "text-emerald-200",
      glow: "shadow-[0_0_22px_rgba(16,185,129,0.7)]",
    },
  };

  const c = accentMap[accent];

  return (
    <div
      className={`rounded-xl border bg-black/70 px-3 py-3 ${c.border} ${c.glow}`}
    >
      <div className="text-[0.7rem] text-slate-400">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${c.text}`}>{value}</div>
    </div>
  );
}

type RowProps = { label: string; value: string };

function Row({ label, value }: RowProps) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
}

type RiskPillProps = { risk: RiskLevel };

function RiskPill({ risk }: RiskPillProps) {
  if (risk === "High") {
    return (
      <span className="px-2 py-0.5 rounded-full text-[0.7rem] bg-red-500/20 text-red-200 border border-red-400/70 shadow-[0_0_18px_rgba(248,113,113,0.8)]">
        High
      </span>
    );
  }
  if (risk === "Medium") {
    return (
      <span className="px-2 py-0.5 rounded-full text-[0.7rem] bg-amber-500/20 text-amber-200 border border-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.8)]">
        Medium
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[0.7rem] bg-emerald-500/20 text-emerald-200 border border-emerald-400/70 shadow-[0_0_18px_rgba(52,211,153,0.8)]">
      Low
    </span>
  );
}
