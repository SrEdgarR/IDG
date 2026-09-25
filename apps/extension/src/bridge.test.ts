import { afterEach, describe, expect, it, vi } from "vitest";
import { request, watch } from "./bridge";

type Listener = (value: unknown) => void;

function event() {
  const listeners: Listener[] = [];
  return {
    addListener(listener: Listener) { listeners.push(listener); },
    emit(value: unknown) { for (const listener of listeners) listener(value); },
  };
}

function port() {
  return {
    onMessage: event(),
    onDisconnect: event(),
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("Chromium Native Messaging bridge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a command only after the matching hello and resolves its matching reply", async () => {
    const nativePort = port();
    const connectNative = vi.fn(() => nativePort);
    vi.stubGlobal("chrome", { runtime: { connectNative, lastError: undefined } });

    const reply = request("ping", "request-1");
    expect(connectNative).toHaveBeenCalledWith("io.github.sredgarr.idg.dev");
    expect(nativePort.postMessage).toHaveBeenNthCalledWith(1, {
      version: 1,
      id: "request-1-hello",
      command: "handshake",
    });

    nativePort.onMessage.emit({ version: 1, id: "request-1-hello", payload: { kind: "hello" } });
    expect(nativePort.postMessage).toHaveBeenNthCalledWith(2, {
      version: 1,
      id: "request-1",
      command: "ping",
    });

    nativePort.onMessage.emit({ version: 1, id: "request-1", payload: { kind: "pong" } });
    await expect(reply).resolves.toEqual({ kind: "pong" });
    expect(nativePort.disconnect).toHaveBeenCalledOnce();
  });

  it("rejects a well-formed response with the wrong correlation id", async () => {
    const nativePort = port();
    vi.stubGlobal("chrome", { runtime: { connectNative: vi.fn(() => nativePort), lastError: undefined } });

    const reply = request("ping", "request-2");
    nativePort.onMessage.emit({ version: 1, id: "request-2-hello", payload: { kind: "hello" } });
    nativePort.onMessage.emit({ version: 1, id: "another-request", payload: { kind: "pong" } });

    await expect(reply).rejects.toThrow("Respuesta fuera de orden.");
    expect(nativePort.disconnect).toHaveBeenCalledOnce();
  });

  it("subscribes after hello and forwards later snapshots", () => {
    const nativePort = port();
    vi.stubGlobal("chrome", { runtime: { connectNative: vi.fn(() => nativePort), lastError: undefined } });
    const onSnapshot = vi.fn();
    const onChange = vi.fn();
    const onClose = vi.fn();

    watch(onSnapshot, onChange, onClose);
    nativePort.onMessage.emit({ version: 1, id: "watch-hello", payload: { kind: "hello" } });
    expect(nativePort.postMessage).toHaveBeenNthCalledWith(2, {
      version: 1,
      id: "watch-subscribe",
      command: "subscribe",
    });

    const snapshot = { native_hosts: 1, runtime_id: "runtime-1", process_id: 42, sequence: 0, clients: 1, stopping: false };
    nativePort.onMessage.emit({ version: 1, id: "watch-subscribe", payload: { kind: "subscribed", snapshot } });
    nativePort.onMessage.emit({ version: 1, id: "", payload: { kind: "snapshot", snapshot: { ...snapshot, sequence: 1 } } });
    nativePort.onMessage.emit({ version: 1, id: "", payload: { kind: "extension_changed", sequence: 2 } });

    expect(onSnapshot).toHaveBeenNthCalledWith(1, snapshot);
    expect(onSnapshot).toHaveBeenNthCalledWith(2, { ...snapshot, sequence: 1 });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
