"use client";

import { syncSmartLifeAccount } from "@/lib/sync-account-client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink, Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";

type AppName = "smartlife" | "tuyaSmart";
type Connection = { connected: boolean; displayName?: string | null; userCode?: string | null; error?: string };
type LoginQr = {
  userCode: string;
  qrToken: string;
  qrImage: string;
  qrSvgImage?: string;
  expiresAt: number;
  expiresIn: number;
  app: AppName;
};
type Problem = { message: string; code?: string; hint?: string; requestId?: string; retryable?: boolean };

type ApiPayload = {
  success?: boolean;
  data?: Connection & Partial<LoginQr> & { pending?: boolean; message?: string; state?: string };
  error?: string;
  code?: string;
  hint?: string;
  retryable?: boolean;
  requestId?: string;
  message?: string;
};

class RequestProblem extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.message);
  }
}

async function requestSmartLife(body?: Record<string, unknown>, signal?: AbortSignal): Promise<ApiPayload> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, body?.action === "sync" ? 55_000 : 22_000);
  try {
    const response = await fetch("/api/smartlife", {
      method: body ? "POST" : "GET",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    let payload: ApiPayload;
    try {
      payload = await response.json();
    } catch {
      throw new RequestProblem({
        message: "The dashboard returned a page instead of a login response. Reload this site and try again.",
        code: "DASHBOARD_RESPONSE", retryable: true,
      });
    }
    if (!response.ok || !payload?.success) {
      throw new RequestProblem({
        message: payload?.error || `The login request failed (HTTP ${response.status}). Please retry.`,
        code: payload?.code,
        hint: payload?.hint,
        retryable: payload?.retryable ?? response.status >= 500,
        requestId: payload?.requestId,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof RequestProblem) throw error;
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new RequestProblem({ message: "The request timed out. Check your connection and try again.", code: "REQUEST_TIMEOUT", retryable: true });
    }
    throw new RequestProblem({ message: "Could not reach the dashboard. Check the tablet's internet connection, then retry.", code: "NETWORK_ERROR", retryable: true });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function toProblem(error: unknown): Problem {
  return error instanceof RequestProblem
    ? error.problem
    : { message: error instanceof Error ? error.message : "The request could not be completed. Please retry.", retryable: true };
}

export function SmartLifeConnection() {
  const [connection, setConnection] = useState<Connection>({ connected: false });
  const [userCode, setUserCode] = useState("");
  const [app, setApp] = useState<AppName>("smartlife");
  const [qr, setQr] = useState<LoginQr | null>(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [remaining, setRemaining] = useState(180);
  const [pollPaused, setPollPaused] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const [useSvg, setUseSvg] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState("");
  const generation = useRef<AbortController | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const qrExpired = Boolean(qr && remaining <= 0);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    requestSmartLife(undefined, controller.signal).then((result) => {
      if (!alive.current || controller.signal.aborted) return;
      const info = result.data;
      if (info) {
        setConnection(info);
        if (info.userCode) setUserCode(info.userCode);
        if (info.error) setProblem({ message: "The saved connection could not be read. You can try reconnecting below.", code: "SESSION_UNAVAILABLE" });
      }
    }).catch((error) => {
      if (alive.current && !controller.signal.aborted) setProblem(toProblem(error));
    });
    return () => {
      alive.current = false;
      controller.abort();
      generation.current?.abort();
      syncAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!qr) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [qr]);

  useEffect(() => {
    if (qr || problem) statusRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [qr?.qrToken, problem?.code]);

  const syncDevices = useCallback(async () => {
    if (syncAbort.current) return;
    const controller = new AbortController();
    syncAbort.current = controller;
    setSyncing(true);
    setProblem(null);
    setNotice("Account connected. Importing the devices Tuya shares with this dashboard…");
    try {
      const result = await syncSmartLifeAccount((message) => { if (alive.current) setNotice(message); }, controller.signal);
      if (!alive.current) return;
      setNotice(result.message || "Device sync completed.");
      if (result.warnings.length) setProblem({ message: `${result.warnings.length} metadata items need attention. ${result.warnings[0].reason}`, code: "SYNC_PARTIAL", retryable: true });
      window.dispatchEvent(new Event("smartlife-updated"));
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        setProblem(toProblem(error));
        setNotice("Your account is connected, but device sync did not complete. Use Sync devices to retry.");
      }
    } finally {
      syncAbort.current = null;
      if (alive.current) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!qr || qrExpired || pollPaused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;
    let completed = false;

    const poll = async () => {
      if (controller.signal.aborted || Date.now() >= qr.expiresAt) return;
      setChecking(true);
      try {
        const result = await requestSmartLife({ action: "poll", userCode: qr.userCode, qrToken: qr.qrToken }, controller.signal);
        if (controller.signal.aborted || !alive.current) return;
        consecutiveFailures = 0;
        if (result.data?.connected) {
          completed = true;
          setConnection({ connected: true, displayName: result.data.displayName, userCode: qr.userCode });
          setQr(null);
          setProblem(null);
          setNotice("Authorization saved. Your account is connected.");
          window.dispatchEvent(new Event("smartlife-updated"));
          // Independent of the polling controller: removing the QR cancels polling,
          // but must NOT cancel the follow-up device import.
          void syncDevices();
          return;
        }
        setProblem(null);
        setNotice(result.data?.message || "Waiting for you to scan and approve in the phone app.");
      } catch (error) {
        if (controller.signal.aborted || !alive.current) return;
        const issue = toProblem(error);
        setProblem(issue);
        consecutiveFailures += 1;
        if (issue.code === "QR_EXPIRED") {
          setRemaining(0);
          setQr((old) => old ? { ...old, expiresAt: Date.now() } : null);
          completed = true;
        } else if (!issue.retryable || consecutiveFailures >= 3) {
          setPollPaused(true);
          completed = true;
        }
      } finally {
        if (!controller.signal.aborted && alive.current) setChecking(false);
      }
      // Recursive timer: never overlap requests or keep polling an expired code.
      if (!completed && !controller.signal.aborted) timer = setTimeout(poll, 3500);
    };
    timer = setTimeout(poll, 1200);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [qr, qrExpired, pollPaused, checkVersion, syncDevices]);

  const generate = async () => {
    if (creating) return;
    const code = userCode.normalize("NFKC").replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, "");
    if (!code) {
      setProblem({ message: "Copy the User Code from your phone app and paste it here first.", code: "USER_CODE_REQUIRED" });
      inputRef.current?.focus();
      return;
    }
    generation.current?.abort();
    const controller = new AbortController();
    generation.current = controller;
    setCreating(true);
    setQr(null);
    setChecking(false);
    setProblem(null);
    setNotice("");
    setUserCode(code);
    setPollPaused(false);
    setUseSvg(false);
    try {
      const result = await requestSmartLife({ action: "start", userCode: code, app }, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const data = result.data;
      if (!data?.qrToken || !data.qrImage || !data.userCode) {
        throw new RequestProblem({ message: "The server response did not contain a QR image. Please retry.", code: "QR_IMAGE_MISSING", retryable: true });
      }
      const lifetime = Number(data.expiresIn || 180);
      // Use relative duration to avoid tablet/server clock-skew problems.
      setQr({ ...data, expiresIn: lifetime, expiresAt: Date.now() + lifetime * 1000, app } as LoginQr);
      setRemaining(lifetime);
      setNotice("Use the scanner inside the selected phone app, not the tablet camera. Tap Confirm after scanning.");
    } catch (error) {
      if (alive.current && !controller.signal.aborted) setProblem(toProblem(error));
    } finally {
      if (alive.current && generation.current === controller) setCreating(false);
    }
  };

  const cancel = () => {
    generation.current?.abort();
    generation.current = null;
    setCreating(false);
    setQr(null);
    setChecking(false);
    setProblem(null);
    setNotice("");
  };

  const disconnect = async () => {
    if (!confirm("Disconnect the saved Smart Life account from this dashboard?")) return;
    setDisconnecting(true);
    setProblem(null);
    try {
      await requestSmartLife({ action: "disconnect" });
      if (!alive.current) return;
      setConnection({ connected: false });
      setQr(null);
      setNotice("Account disconnected.");
      window.dispatchEvent(new Event("smartlife-updated"));
    } catch (error) {
      if (alive.current) setProblem(toProblem(error));
    } finally {
      if (alive.current) setDisconnecting(false);
    }
  };

  return (
    <section data-testid="smartlife-connect" className="space-y-4 rounded-2xl border border-cyan-800/70 bg-cyan-950/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-cyan-200"><QrCode className="h-5 w-5" /> Connect your Smart Life account</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">1. Copy User Code &nbsp; 2. Generate QR &nbsp; 3. Scan and approve</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${connection.connected ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
          {connection.connected ? "CONNECTED" : "NOT CONNECTED"}
        </span>
      </div>

      {connection.connected ? (
        <div className="space-y-3 rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 className="h-5 w-5" />{connection.displayName || "Account connected"}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void syncDevices()} disabled={syncing} className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-slate-950 disabled:opacity-60">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{syncing ? "Syncing devices…" : "Sync devices"}
            </button>
            <button type="button" onClick={() => void disconnect()} disabled={disconnecting || syncing} className="min-h-11 rounded-xl border border-slate-700 px-4 text-xs text-slate-300 disabled:opacity-50">{disconnecting ? "Disconnecting…" : "Disconnect"}</button>
          </div>
        </div>
      ) : (
        <>
          <fieldset disabled={creating || Boolean(qr)}>
            <legend className="mb-2 text-xs font-semibold text-slate-300">Which app controls your devices?</legend>
            <div className="grid grid-cols-2 gap-2">
              {([{ value: "smartlife", label: "Smart Life" }, { value: "tuyaSmart", label: "Tuya Smart" }] as const).map((choice) => (
                <label key={choice.value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${app === choice.value ? "border-cyan-400 bg-cyan-500/15 text-cyan-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
                  <input type="radio" name="smartlife-app" value={choice.value} checked={app === choice.value} onChange={() => setApp(choice.value)} className="accent-cyan-400" />{choice.label}
                </label>
              ))}
            </div>
          </fieldset>

          {!qr && (
            <form onSubmit={(event) => { event.preventDefault(); void generate(); }} className="space-y-3">
              <div className="rounded-xl bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300">
                <p className="mb-1 flex items-center gap-2 font-semibold text-white"><Smartphone className="h-4 w-4 text-cyan-300" />Find the code on your phone</p>
                <p><strong>Me → Settings (⚙) → Account and Security → User Code → Copy</strong></p>
                <p className="mt-1 text-slate-500">Use the same app and account as your home. This is <strong>not</strong> the Cloud UID, Access ID, email, password, or device ID.</p>
              </div>
              <label className="block text-xs font-semibold text-slate-300" htmlFor="smartlife-user-code">App User Code</label>
              <input
                ref={inputRef}
                id="smartlife-user-code"
                value={userCode}
                onChange={(e) => { setUserCode(e.target.value); if (problem?.code?.includes("USER")) setProblem(null); }}
                readOnly={creating}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="smartlife-code-help"
                aria-invalid={Boolean(problem?.code?.includes("USER"))}
                placeholder="Paste the User Code copied from the phone app"
                className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder:text-[11px] placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <p id="smartlife-code-help" className="text-[11px] text-slate-400">Paste it here only. Do not send account codes or passwords in chat.</p>
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-70">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}{creating ? "Requesting QR from Tuya…" : problem?.retryable ? "Retry QR generation" : "Generate QR"}
                </button>
                {creating && <button type="button" onClick={cancel} className="min-h-12 rounded-xl bg-slate-800 px-3 text-xs text-slate-300">Cancel</button>}
              </div>
            </form>
          )}

          {qr && (
            <div data-testid="qr-panel" className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">{qr.app === "smartlife" ? "Smart Life" : "Tuya Smart"} authorization</span>
                <span className={qrExpired ? "font-bold text-amber-300" : "font-mono text-cyan-200"} role="timer" aria-live="off">
                  {qrExpired ? "Expired" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} remaining`}
                </span>
              </div>
              <div className="relative mx-auto max-w-[336px] rounded-2xl bg-white p-2">
                {/* A locally generated PNG; SVG is a browser-safe fallback. Never use an external QR service. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={useSvg && qr.qrSvgImage ? qr.qrSvgImage : qr.qrImage}
                  alt="Scan this QR code with your Smart Life or Tuya Smart app"
                  width={320}
                  height={320}
                  className={`block h-auto w-full rounded-xl ${qrExpired ? "opacity-15" : ""}`}
                  onError={() => {
                    if (!useSvg && qr.qrSvgImage) setUseSvg(true);
                    else setProblem({ message: "The QR image could not be displayed. Try downloading the QR image or generating a fresh one.", code: "QR_IMAGE_DISPLAY", retryable: true });
                  }}
                />
                {qrExpired && <div className="absolute inset-0 flex items-center justify-center rounded-2xl p-6 text-center text-sm font-bold text-slate-900">This QR code has expired.<br />Use Refresh QR below.</div>}
              </div>
              <p className="text-center text-xs leading-relaxed text-slate-300">On your phone: <strong>{qr.app === "smartlife" ? "Smart Life" : "Tuya Smart"} → + → Scan</strong>.<br />Scan the tablet's code, then tap <strong>Confirm / Authorize</strong>.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setPollPaused(false); setCheckVersion((v) => v + 1); }} disabled={qrExpired || checking} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-3 text-xs font-bold text-slate-950 disabled:opacity-50">
                  {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{checking ? "Checking approval…" : "I've scanned it"}
                </button>
                <button type="button" onClick={() => void generate()} disabled={creating} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-700 bg-slate-900 px-3 text-xs font-semibold text-cyan-200"><RefreshCw className="h-3.5 w-3.5" />Refresh QR</button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <button type="button" onClick={cancel} className="min-h-10 rounded-lg px-2 text-slate-300 underline underline-offset-4">Change code / app</button>
                {!qrExpired && <a href={qr.qrImage} download="smartlife-login.png" className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-cyan-300"><Download className="h-3.5 w-3.5" />Download QR</a>}
              </div>
            </div>
          )}
        </>
      )}

      <div ref={statusRef} className="space-y-2">
        {problem && <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3 text-xs leading-relaxed text-rose-100">
          <p className="flex items-start gap-2 font-semibold"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />{problem.message}</p>
          {problem.hint && <p className="mt-2 text-rose-100/80">{problem.hint}</p>}
          {(problem.code || problem.requestId) && <p className="mt-2 break-all font-mono text-[10px] text-rose-200/60">{problem.code}{problem.requestId ? ` · Ref ${problem.requestId.slice(0, 8)}` : ""}</p>}
        </div>}
        {notice && <p role="status" className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-300">{notice}</p>}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">A QR code appears only after Tuya accepts the User Code. This dashboard never needs your account password; approved tokens stay encrypted on the server.</p>
      <a href="https://www.home-assistant.io/integrations/tuya/#obtaining-user-code-for-sign-in" target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[11px] text-cyan-300 underline underline-offset-4">Official User Code instructions<ExternalLink className="h-3 w-3" /></a>
      <span className="block text-right font-mono text-[9px] text-slate-600">QR login v2</span>
    </section>
  );
}
