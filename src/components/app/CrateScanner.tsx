import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, CameraOff, Check, ExternalLink, FlashlightOff, Flashlight, ImageUp, Pause, Play, SwitchCamera, X, Wand2 } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/app/kit";
import { cn } from "@/lib/utils";

export type ScanOutcome = "ok" | "dup" | "error";

interface Props {
  /** Called for every decoded code. Return the outcome to drive feedback. */
  onScan: (code: string) => Promise<ScanOutcome> | ScanOutcome;
  /** Optional "Simulate scan" provider for demos without a camera. */
  onSimulate?: () => string | null;
  disabled?: boolean;
  placeholder?: string;
}

type CamState = "idle" | "starting" | "running" | "paused" | "error";

function beep(ok: boolean) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.12 : 0.25));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 400);
  } catch { /* audio unavailable */ }
}

function friendlyError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as Error)?.message ?? e);
  if (!window.isSecureContext) return "Camera needs a secure (HTTPS) connection. Open the published app or use manual entry below.";
  if (name === "NotAllowedError" || /permission|denied|notallowed/i.test(msg)) return "Camera permission was denied. Allow camera access in your browser settings, or use manual entry below.";
  if (name === "NotFoundError" || /not ?found|no camera|Requested device not found/i.test(msg)) return "No camera was found on this device. Use manual entry or upload a photo.";
  if (name === "NotReadableError" || /in use|could not start|NotReadable/i.test(msg)) return "The camera is in use by another app. Close it and try again.";
  return "Could not start the camera: " + msg;
}

export default function CrateScanner({ onScan, onSimulate, disabled, placeholder = "e.g. CRATE-B40-0001" }: Props) {
  const regionId = "scan-" + useId().replace(/:/g, "");
  const scanner = useRef<Html5Qrcode | null>(null);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [state, setState] = useState<CamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOk, setTorchOk] = useState(false);
  const [torch, setTorch] = useState(false);
  const [flash, setFlash] = useState<{ k: number; ok: ScanOutcome } | null>(null);
  const [manual, setManual] = useState("");
  const [inIframe, setInIframe] = useState(false);
  const reduce = useReducedMotion();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInIframe(window.self !== window.top); }, []);

  const handle = useCallback(async (raw: string) => {
    const now = Date.now();
    if (busy.current) return;
    if (raw === last.current.code && now - last.current.at < 1800) return; // same code still in frame
    last.current = { code: raw, at: now };
    busy.current = true;
    try {
      const r = await onScan(raw);
      setFlash({ k: now, ok: r });
      if (r === "ok") { navigator.vibrate?.(60); beep(true); }
      else if (r === "error") { navigator.vibrate?.([40, 60, 40]); beep(false); }
    } finally {
      busy.current = false;
    }
  }, [onScan]);

  const stop = useCallback(async () => {
    const s = scanner.current;
    scanner.current = null;
    if (s) {
      try { if (s.isScanning) await s.stop(); } catch { /* already stopped */ }
      try { s.clear(); } catch { /* noop */ }
    }
    setTorch(false);
    setTorchOk(false);
  }, []);

  const start = useCallback(async (mode: "environment" | "user" = facing) => {
    setError(null);
    if (!window.isSecureContext) { setState("error"); setError(friendlyError(new Error("insecure"))); return; }
    setState("starting");
    try {
      await stop();
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import("html5-qrcode");
      const s = new Html5Qrcode(regionId, { verbose: false, formatsToSupport: [F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8] });
      scanner.current = s;
      await s.start(
        { facingMode: mode },
        { fps: 10, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.7); return { width: m, height: m }; }, aspectRatio: 1 },
        (text) => { void handle(text); },
        () => { /* per-frame miss: ignore */ },
      );
      try {
        const caps = s.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        setTorchOk(!!caps.torch);
      } catch { setTorchOk(false); }
      setState("running");
    } catch (e) {
      await stop();
      setState("error");
      setError(friendlyError(e));
    }
  }, [facing, handle, regionId, stop]);

  // Turn the camera off when leaving the page or tab.
  useEffect(() => {
    const vis = () => { if (document.hidden && scanner.current) { void stop(); setState("idle"); } };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); void stop(); };
  }, [stop]);

  async function switchCam() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    await start(next);
  }
  async function toggleTorch() {
    const s = scanner.current;
    if (!s) return;
    try {
      await s.applyVideoConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { setTorchOk(false); }
  }
  function pause() {
    const s = scanner.current;
    if (!s) return;
    if (state === "running") { s.pause(true); setState("paused"); } else { s.resume(); setState("running"); }
  }
  async function close() { await stop(); setState("idle"); }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const tmp = new Html5Qrcode(regionId + "-file", { verbose: false });
      const text = await tmp.scanFile(f, false);
      tmp.clear();
      last.current = { code: "", at: 0 };
      await handle(text);
    } catch {
      setFlash({ k: Date.now(), ok: "error" });
      setError("No QR code or barcode found in that photo.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const live = state === "running" || state === "paused" || state === "starting";
  const frameTone = flash?.ok === "ok" ? "var(--success)" : flash?.ok === "error" ? "var(--danger)" : flash?.ok === "dup" ? "var(--warning)" : "var(--primary)";

  return (
    <div className="space-y-3">
      <motion.div
        key={flash?.ok === "error" ? flash.k : "s"}
        animate={flash?.ok === "error" && !reduce ? { x: [0, -10, 10, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-background sm:aspect-[4/3]"
      >
        {/* html5-qrcode mounts the <video> here */}
        <div id={regionId} className={cn("absolute inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover [&_img]:hidden", !live && "hidden")} />
        <div id={regionId + "-file"} className="hidden" />

        {live && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative size-[70%]">
              {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl"]).map((c, i) => (
                <motion.span key={i} className={cn("absolute size-8", c)} style={{ borderColor: frameTone }}
                  animate={reduce ? {} : { scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
              ))}
              {state === "running" && !reduce && <ScanLine />}
            </div>
          </div>
        )}

        <AnimatePresence>
          {flash && flash.ok !== "dup" && live && (
            <motion.div key={flash.k} className={cn("pointer-events-none absolute inset-0", flash.ok === "ok" ? "bg-success/25" : "bg-danger/25")}
              initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.6 }} />
          )}
          {flash?.ok === "ok" && (
            <motion.div key={"c" + flash.k} className="pointer-events-none absolute inset-0 grid place-items-center"
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], scale: 1 }} transition={{ duration: 0.9 }}>
              <div className="grid size-16 place-items-center rounded-full bg-success text-primary-foreground"><Check className="size-8" strokeWidth={3} /></div>
            </motion.div>
          )}
        </AnimatePresence>

        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {state === "error" ? (
              <>
                <div className="grid size-14 place-items-center rounded-full bg-danger/12 text-danger"><CameraOff className="size-6" /></div>
                <p className="max-w-xs text-sm text-foreground">{error}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => start()} disabled={disabled}><Camera /> Try again</Button>
                  {inIframe && <Button size="sm" variant="outline" onClick={() => window.open(window.location.href, "_blank", "noopener")}><ExternalLink /> Open in new tab</Button>}
                </div>
              </>
            ) : (
              <>
                <div className="grid size-14 place-items-center rounded-full bg-info/12 text-info"><Camera className="size-6" /></div>
                <div>
                  <div className="font-semibold text-foreground">Scan crate labels</div>
                  <p className="mt-1 max-w-xs text-sm">We'll ask for camera access. Point at a crate QR code or barcode — scans add automatically.</p>
                </div>
                <Button onClick={() => start()} disabled={disabled}><Camera /> Start Scanning</Button>
                {inIframe && (
                  <p className="max-w-xs text-xs">Camera may be blocked inside the editor preview.{" "}
                    <button className="text-primary underline" onClick={() => window.open(window.location.href, "_blank", "noopener")}>Open in new tab</button>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {live && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-3">
            <CtrlBtn label="Switch camera" onClick={switchCam}><SwitchCamera /></CtrlBtn>
            {torchOk && <CtrlBtn label="Toggle torch" onClick={toggleTorch}>{torch ? <FlashlightOff /> : <Flashlight />}</CtrlBtn>}
            <CtrlBtn label={state === "paused" ? "Resume" : "Pause"} onClick={pause}>{state === "paused" ? <Play /> : <Pause />}</CtrlBtn>
            <CtrlBtn label="Close camera" onClick={close}><X /></CtrlBtn>
          </div>
        )}
      </motion.div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { last.current = { code: "", at: 0 }; void handle(manual.trim()); setManual(""); } }}>
        <input className={inputCls} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={placeholder} aria-label="Crate ID" disabled={disabled} />
        <Button type="submit" variant="outline" disabled={disabled || !manual.trim()}>Add</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled}><ImageUp /> Upload photo to scan</Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {onSimulate && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { const c = onSimulate(); if (c) { last.current = { code: "", at: 0 }; void handle(c); } }}>
            <Wand2 /> Simulate scan
          </Button>
        )}
      </div>
    </div>
  );
}

function ScanLine() {
  // Full-size box whose top edge is the line; translating it 0→100% sweeps the line top→bottom (transform only).
  return (
    <span aria-hidden className="absolute inset-0 overflow-hidden">
      <motion.span className="absolute inset-x-3 top-0 block h-full border-t-2 border-primary"
        animate={{ y: ["0%", "98%", "0%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
    </span>
  );
}

function CtrlBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="grid size-11 place-items-center rounded-full bg-surface-1/85 text-foreground transition-transform active:scale-95 [&_svg]:size-5">
      {children}
    </button>
  );
}
