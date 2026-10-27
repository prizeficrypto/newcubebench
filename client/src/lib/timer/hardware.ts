import type { HoldState } from "./engine.ts";

/**
 * Hardware timers that drive the practice timer: a StackMat (Gen 3/4, read
 * through the mic/line-in jack) and the GAN Smart Timer / Halo (Bluetooth).
 * Both report the same three things to the timer engine — hands on/ready,
 * started, stopped with the mat's own time — so the page treats them alike.
 *
 * A connection is a plain object owned by the page, NOT by a component, so it
 * survives re-renders and new scrambles (a StackMat must not disconnect after
 * every solve).
 */

export type HardwareStatus =
  | "connecting"
  | "connected"
  | "denied" // microphone / Bluetooth permission refused
  | "unsupported"
  | "lost" // the device went away
  | "error";

export type HardwareHandlers = {
  onHold: (hold: HoldState) => void;
  onStart: () => void;
  /** the device's own final time, ms */
  onStop: (ms: number) => void;
  /** live reading while running, ms (StackMat only) */
  onLive?: (ms: number) => void;
  onStatus: (status: HardwareStatus) => void;
};

export type HardwareConnection = { close: () => void };

// ---------- StackMat (audio) ----------

export async function connectStackmat(h: HardwareHandlers): Promise<HardwareConnection> {
  h.onStatus("connecting");
  try {
    // Ask for the mic ourselves so a refusal surfaces clearly (the library's
    // own start() swallows it). Processing that would distort the signal off.
    const probe = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    probe.getTracks().forEach((track) => track.stop());
  } catch (err) {
    const denied = err instanceof DOMException && err.name === "NotAllowedError";
    h.onStatus(denied ? "denied" : "error");
    return { close: () => {} };
  }
  try {
    const { default: Stackmat, PacketStatus } = await import("stackmat");
    const sm = new Stackmat();
    sm.on("ready", () => h.onHold("ready"));
    sm.on("unready", () => h.onHold("none"));
    sm.on("started", () => h.onStart());
    sm.on("packetReceived", (p) => {
      if (p.status === PacketStatus.RUNNING) h.onLive?.(p.timeInMilliseconds);
    });
    sm.on("stopped", (p) => {
      if (p.timeInMilliseconds > 0) h.onStop(p.timeInMilliseconds);
    });
    sm.start();
    h.onStatus("connected");
    return {
      close: () => {
        sm.stop();
        sm.off();
      },
    };
  } catch {
    h.onStatus("error");
    return { close: () => {} };
  }
}

// ---------- GAN Smart Timer (Bluetooth) ----------
//
// Protocol per the MIT-licensed gan-web-bluetooth project
// (https://github.com/afedotov/gan-web-bluetooth), reimplemented here: the
// timer notifies state packets on characteristic FFF5 of service FFF0. Each
// packet starts with 0xFE; byte 3 is the state; a STOPPED packet carries the
// recorded time at bytes 4-7 (minutes u8, seconds u8, milliseconds u16 LE).

const GAN_SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
const GAN_STATE = "0000fff5-0000-1000-8000-00805f9b34fb";

const GanState = {
  GET_SET: 1,
  HANDS_OFF: 2,
  RUNNING: 3,
  STOPPED: 4,
  IDLE: 5,
  HANDS_ON: 6,
} as const;

type BluetoothLike = {
  requestDevice: (opts: unknown) => Promise<{
    name?: string;
    gatt?: { connect: () => Promise<GattServer>; connected: boolean; disconnect: () => void };
    addEventListener: (type: string, fn: () => void) => void;
  }>;
};
type GattServer = {
  getPrimaryService: (uuid: string) => Promise<{
    getCharacteristic: (uuid: string) => Promise<GattChar>;
  }>;
};
type GattChar = EventTarget & {
  value?: DataView;
  startNotifications: () => Promise<unknown>;
};

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/** Decode one GAN timer packet; null if it isn't one. Exported for tests. */
export function decodeGanPacket(
  data: DataView,
): { state: number; ms?: number } | null {
  if (data.byteLength < 4 || data.getUint8(0) !== 0xfe) return null;
  const state = data.getUint8(3);
  if (state === GanState.STOPPED && data.byteLength >= 8) {
    const ms =
      data.getUint8(4) * 60_000 + data.getUint8(5) * 1000 + data.getUint16(6, true);
    return { state, ms };
  }
  return { state };
}

export async function connectGanTimer(h: HardwareHandlers): Promise<HardwareConnection> {
  if (!bluetoothSupported()) {
    h.onStatus("unsupported");
    return { close: () => {} };
  }
  h.onStatus("connecting");
  const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
  try {
    const device = await bt.requestDevice({
      filters: [{ namePrefix: "GAN" }, { namePrefix: "gan" }, { namePrefix: "Gan" }],
      optionalServices: [GAN_SERVICE],
    });
    if (!device.gatt) throw new Error("no gatt");
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(GAN_SERVICE);
    const chr = await service.getCharacteristic(GAN_STATE);
    const onPacket = () => {
      const p = chr.value ? decodeGanPacket(chr.value) : null;
      if (!p) return;
      switch (p.state) {
        case GanState.HANDS_ON:
          h.onHold("holding");
          break;
        case GanState.GET_SET:
          h.onHold("ready");
          break;
        case GanState.HANDS_OFF:
        case GanState.IDLE:
          h.onHold("none");
          break;
        case GanState.RUNNING:
          h.onStart();
          break;
        case GanState.STOPPED:
          if (p.ms && p.ms > 0) h.onStop(p.ms);
          break;
      }
    };
    chr.addEventListener("characteristicvaluechanged", onPacket);
    device.addEventListener("gattserverdisconnected", () => h.onStatus("lost"));
    await chr.startNotifications();
    h.onStatus("connected");
    return {
      close: () => {
        chr.removeEventListener("characteristicvaluechanged", onPacket);
        if (device.gatt?.connected) device.gatt.disconnect();
      },
    };
  } catch (err) {
    // The user closing the device picker is a NotFoundError: not an error.
    const name = err instanceof DOMException ? err.name : "";
    h.onStatus(name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "lost" : "error");
    return { close: () => {} };
  }
}
