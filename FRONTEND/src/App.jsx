import { useEffect, useState } from "react";
import { Activity, LogOut } from "lucide-react";

const PRODUCTION_ISS_MARKERS = [
  "bestpractice.com.au",
  "bpsoftware.net",
  "myhealthrecord",
  "digitalhealth.gov.au",
  "servicesaustralia",
  "medicare",
  "oraclehealth",
  "cerner.com",
  "epic.com",
  "ihi.gov",
];

function isSyntheticIssuer(iss) {
  try {
    const parsed = new URL(iss);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = (parsed.hostname || "").toLowerCase();
    const lowered = iss.toLowerCase();
    if (PRODUCTION_ISS_MARKERS.some((marker) => lowered.includes(marker))) {
      return false;
    }
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.includes("sandbox") ||
      host.includes("synthetic")
    );
  } catch {
    return false;
  }
}

function isSyntheticLaunch(launch) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(launch);
}

function readSyntheticLaunchContext(search) {
  const params = new URLSearchParams(search);
  const launch = params.get("launch");
  const iss = params.get("iss");
  if (!launch || !iss) {
    return null;
  }
  if (!isSyntheticLaunch(launch) || !isSyntheticIssuer(iss)) {
    return null;
  }
  return { launch, iss };
}

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [developerToken, setDeveloperToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [session, setSession] = useState(null);
  const [smartLaunch, setSmartLaunch] = useState(null);

  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const hadLaunchParams = params.has("launch") || params.has("iss");
    const context = readSyntheticLaunchContext(search);

    if (hadLaunchParams) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!context) {
      return;
    }

    setSmartLaunch(context);
    setScreen("login");
  }, []);

  const completeSession = (name, role) => {
    setSession({
      name,
      role,
      smartLaunch: smartLaunch
        ? { launch: smartLaunch.launch, iss: smartLaunch.iss }
        : null,
    });
    setScreen("dashboard");
  };

  const handleClinicianSso = () => {
    setAuthError("");
    completeSession("Dr. Alex Smith", "doctor");
  };

  const handleTesterKey = (event) => {
    event.preventDefault();
    if (developerToken === "mt_live_secret123") {
      setAuthError("");
      completeSession("Systems Tester", "tester");
      return;
    }
    setAuthError("Invalid developer token. Use the sandbox key mt_live_secret123.");
  };

  const handleLogout = () => {
    setSession(null);
    setDeveloperToken("");
    setAuthError("");
    setSmartLaunch(null);
    setScreen("welcome");
  };

  if (screen === "welcome") {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-semibold tracking-tight text-zinc-900">
              Welcome to Testing App
            </h1>
            <p className="text-lg leading-relaxed text-zinc-500">
              MedTalk Connect FHIR R4 Sandbox for safe clinical interoperability
              checks against synthetic Australian patient data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScreen("login")}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-8 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  if (screen === "login") {
    const canVerifyKey = Boolean(developerToken.trim());

    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl rounded-2xl border-2 border-slate-600 bg-slate-900 p-8 md:p-10 space-y-8 shadow-2xl">
          <div className="space-y-2 border-b-2 border-slate-700 pb-6">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-50">
              MedTalk Identity & Access Management
            </h2>
            <p className="text-sm font-medium tracking-wide text-slate-300">
              Secure Health Provider Single Sign-On (SSO)
            </p>
            {smartLaunch ? (
              <p className="text-xs text-slate-400">
                Sandbox launch received. Complete federated sign-on to continue.
              </p>
            ) : null}
          </div>
          {authError ? (
            <div className="rounded-md border border-red-500 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {authError}
            </div>
          ) : null}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col rounded-xl border-2 border-slate-500 bg-slate-800/70 p-6 space-y-5">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-50">
                  ⚕️ Launch via Hospital Provider
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">
                  Simulate secure federated login via PRODA / My Health Record or
                  Hospital Active Directory.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClinicianSso}
                className="mt-auto w-full rounded-lg border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white"
              >
                Launch via Hospital Provider
              </button>
            </div>
            <form
              onSubmit={handleTesterKey}
              className="flex flex-col rounded-xl border-2 border-slate-500 bg-slate-800/70 p-6 space-y-5"
            >
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-50">
                  🛠️ System Tester Pipeline Key
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">
                  Authenticate using a MedTalk Connect Developer Token or Sandbox
                  API Client Secret Key.
                </p>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">
                  Enter App Token / Secret Key
                </span>
                <input
                  type="password"
                  value={developerToken}
                  onChange={(event) => {
                    setDeveloperToken(event.target.value);
                    if (authError) {
                      setAuthError("");
                    }
                  }}
                  placeholder="mt_live_xxxx..."
                  autoComplete="off"
                  className="w-full rounded-lg border-2 border-slate-500 bg-slate-950 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none transition focus:border-slate-200 focus:ring-2 focus:ring-slate-400/40"
                />
                <span className="text-[11px] text-slate-500">
                  Use key: mt_live_secret123
                </span>
              </label>
              <button
                type="submit"
                disabled={!canVerifyKey}
                className="mt-auto w-full rounded-lg border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700 disabled:text-slate-400"
              >
                Verify Key
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
      <header className="h-16 shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-900 text-white">
              <Activity className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium tracking-wide text-zinc-600">
              AU-Sandbox
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-700">
              {session?.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 bg-zinc-50 bg-[radial-gradient(circle,_#d4d4d8_1.1px,_transparent_1.1px)] bg-[size:22px_22px] flex items-center justify-center px-6 py-16">
        <div className="rounded-2xl border border-zinc-200 bg-white px-10 py-8 shadow-sm">
          <p className="text-xl font-medium tracking-tight text-zinc-900">
            Welcome, {session?.name}!
          </p>
        </div>
      </main>
    </div>
  );
}
