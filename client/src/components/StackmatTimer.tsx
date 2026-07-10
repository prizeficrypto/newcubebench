import { useEffect, useRef, useState } from "react";
import Stackmat, { PacketStatus } from "stackmat";
import { formatMs } from "../lib/cubing.ts";
import { useT } from "../lib/i18n.tsx";

/**
 * Drives the practice timer from a physical StackMat (Gen3/Gen4) connected to
 * the computer's mic/line-in via the 3.5mm cable. The `stackmat` library reads
 * the audio signal and emits state; we mirror it into the same calm time
 * display the keyboard timer uses, and record a solve when the mat stops.
 *
 * The mat itself owns start/stop/reset — the keyboard does nothing here.
 */
type Conn = "off" | "connecting" | "listening" | "denied" | "error";

export function StackmatTimer({
  scramble,
  solveIndex,
  onSolve,
}: {
  scramble: string;
  solveIndex: number;
  onSolve: (ms: number) => void;
}) {
  const { t } = useT();
  const [conn, setConn] = useState<Conn>("off");
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const smRef = useRef<Stackmat | null>(null);
  // Keep the latest onSolve without re-subscribing the mat's listeners.
  const onSolveRef = useRef(onSolve);
  onSolveRef.current = onSolve;

  // Tear down the audio pipeline when the component unmounts or the input
  // mode switches away from Stackmat.
  useEffect(
    () => () => {
      smRef.current?.stop();
      smRef.current?.off();
      smRef.current = null;
    },
    [],
  );

  // A fresh scramble means the previous solve is banked — clear the readout.
  useEffect(() => {
    setMs(0);
    setRunning(false);
  }, [scramble, solveIndex]);

  async function connect() {
    setConn("connecting");
    try {
      // Pre-request the mic ourselves so a denied permission surfaces cleanly
      // (the library's own start() does not report audio errors). Disable
      // processing that would distort the mat's signal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      // The library opens its own capture; release this probe stream.
      stream.getTracks().forEach((track) => track.stop());

      const sm = new Stackmat();
      smRef.current = sm;
      sm.on("ready", () => setReady(true));
      sm.on("unready", () => setReady(false));
      sm.on("started", () => {
        setReady(false);
        setRunning(true);
      });
      sm.on("packetReceived", (p) => {
        if (p.status === PacketStatus.RUNNING) setMs(p.timeInMilliseconds);
      });
      sm.on("stopped", (p) => {
        setRunning(false);
        setMs(p.timeInMilliseconds);
        if (p.timeInMilliseconds > 0) onSolveRef.current(p.timeInMilliseconds);
      });
      sm.on("reset", () => {
        setMs(0);
        setRunning(false);
      });
      sm.start();
      setConn("listening");
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setConn(denied ? "denied" : "error");
    }
  }

  // ---- pre-connection states ----
  if (conn !== "listening") {
    return (
      <div className="solve">
        <div className="solve__head">
          <span className="eyebrow">{t("Stackmat")}</span>
          <div className="solve__scramble mono">{scramble}</div>
        </div>
        <div className="stackmat-connect">
          {conn === "connecting" ? (
            <>
              <div className="spinner" />
              <p className="muted">{t("Requesting microphone…")}</p>
            </>
          ) : (
            <>
              <p className="muted stackmat-connect__lead">
                {conn === "denied"
                  ? t("Microphone access is needed to read the Stackmat. Allow it in your browser, then try again.")
                  : conn === "error"
                    ? t("Couldn't start listening. Check that your Stackmat cable is in the mic/line-in jack, then try again.")
                    : t("Plug your Stackmat into the mic/line-in jack with the audio cable, then connect. We read its signal through the microphone.")}
              </p>
              <button className="btn" onClick={connect}>
                {conn === "off" ? t("Connect Stackmat") : t("Try again")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- live, listening ----
  const timeCls = running ? "timer--running" : "";
  const holdCls = ready ? " is-armed" : "";
  return (
    <div className="solve">
      <div className="solve__head">
        <span className="eyebrow">{t("Stackmat")}</span>
        <div className="solve__scramble mono">{scramble}</div>
      </div>
      <div className={`timer-zone timer-zone--${running ? "running" : "idle"}`}>
        <div className={`timer ${timeCls}`}>
          <div className={`timer__time mono${holdCls}`}>{formatMs(ms)}</div>
          <div className="timer__hint" role="status" aria-live="polite">
            {running
              ? t("Solving…")
              : ready
                ? t("Ready, lift your hands to start")
                : t("Hands on the mat when you're ready. The mat runs the timer.")}
          </div>
        </div>
      </div>
    </div>
  );
}
