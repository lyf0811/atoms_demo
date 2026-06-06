"use client";

import { useEffect, useRef, useState } from "react";

type BrowserPtyTerminalProps = {
  active: boolean;
  projectId: string;
  onAssistantOutput?: (data: string) => void;
  onTerminalStatusChange?: (status: TerminalConnectionStatus) => void;
};

type TerminalConnectionStatus = "loading" | "terminal-connected" | "opencode-connected" | "closed" | "error";

export function BrowserPtyTerminal({ active, projectId, onAssistantOutput, onTerminalStatusChange }: BrowserPtyTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<unknown>(null);
  const fitAddonRef = useRef<{ fit: () => void } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingInputRef = useRef<string[]>([]);
  const [status, setStatus] = useState<TerminalConnectionStatus>("loading");

  function updateStatus(nextStatus: TerminalConnectionStatus) {
    setStatus(nextStatus);
    onTerminalStatusChange?.(nextStatus);
  }

  function sendTerminalInput(data: string, source = "terminal") {
    const socket = socketRef.current;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "input", data, source }));
      return;
    }

    pendingInputRef.current.push(JSON.stringify({ data, source }));
  }

  useEffect(() => {
    const handleExternalInput = (event: Event) => {
      const data = (event as CustomEvent<{ data?: string }>).detail?.data;

      if (typeof data === "string" && data) {
        sendTerminalInput(data, "chat");
      }
    };

    window.addEventListener("atoms-terminal-input", handleExternalInput);

    return () => {
      window.removeEventListener("atoms-terminal-input", handleExternalInput);
    };
  }, []);

  useEffect(() => {
    let isDisposed = false;

    async function boot() {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm") as Promise<{ Terminal: new (options: Record<string, unknown>) => TerminalLike }>,
          import("@xterm/addon-fit") as Promise<{ FitAddon: new () => { fit: () => void } }>,
        ]);

        if (isDisposed || !hostRef.current) {
          return;
        }

        const terminal = new Terminal({
          cursorBlink: true,
          convertEol: true,
          fontFamily: "Cascadia Mono, Consolas, Liberation Mono, monospace",
          fontSize: 13,
          theme: {
            background: "#0f172a",
            foreground: "#dbeafe",
            cursor: "#93c5fd",
            selectionBackground: "#334155",
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(hostRef.current);
        terminal.focus();
        terminal.writeln("[atoms terminal] connecting to local PTY...");

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(`${protocol}://${window.location.host}/api/pty?projectId=${encodeURIComponent(projectId)}`);
        socketRef.current = socket;

        socket.addEventListener("open", () => {
          updateStatus("terminal-connected");
          terminal.writeln("[atoms terminal] connected.");
          for (const queued of pendingInputRef.current.splice(0)) {
            try {
              const parsed = JSON.parse(queued) as { data: string; source?: string };
              sendTerminalInput(parsed.data, parsed.source || "terminal");
            } catch {
              sendTerminalInput(queued);
            }
          }
          requestAnimationFrame(() => {
            fitAddon.fit();
            sendResize();
          });
        });

        socket.addEventListener("message", (event) => {
          try {
            const payload = JSON.parse(event.data) as { type?: string; data?: string };

            if (payload.type === "output" && typeof payload.data === "string") {
              terminal.write(payload.data);

              if (payload.data.includes("[atoms terminal] starting opencode")) {
                updateStatus("opencode-connected");
              }

              if (payload.data.includes("[atoms terminal] opencode was not found")) {
                updateStatus("error");
              }
            }

            if (payload.type === "opencode-status" && payload.data === "starting") {
              updateStatus("terminal-connected");
            }

            if (payload.type === "assistant" && typeof payload.data === "string") {
              onAssistantOutput?.(payload.data);
            }
          } catch {
            terminal.write(String(event.data));
          }
        });

        socket.addEventListener("close", () => {
          updateStatus("closed");
          terminal.writeln("\r\n[atoms terminal] disconnected.");
        });

        socket.addEventListener("error", () => {
          updateStatus("error");
          terminal.writeln("\r\n[atoms terminal] websocket error.");
        });

        terminal.onData((data: string) => {
          sendTerminalInput(data, "terminal");
        });

        const sendResize = () => {
          const dimensions = terminal.rows && terminal.cols ? { cols: terminal.cols, rows: terminal.rows } : null;

          if (dimensions && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "resize", ...dimensions }));
          }
        };

        const resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            fitAddon.fit();
            sendResize();
          });
        });
        resizeObserver.observe(hostRef.current);

        return () => {
          resizeObserver.disconnect();
        };
      } catch (error) {
        updateStatus("error");
        hostRef.current?.replaceChildren(
          document.createTextNode(
            [
              "Real terminal failed to load.",
              "Check that the dev server was restarted after npm install.",
              error instanceof Error ? error.message : String(error),
            ].join("\n"),
          ),
        );
      }
    }

    let cleanup: void | (() => void);
    void boot().then((value) => {
      cleanup = value;
    });

    return () => {
      isDisposed = true;
      cleanup?.();
      socketRef.current?.close();
      (terminalRef.current as { dispose?: () => void } | null)?.dispose?.();
    };
  }, [projectId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      (terminalRef.current as { focus?: () => void } | null)?.focus?.();
      const socket = socketRef.current;
      const terminal = terminalRef.current as { cols?: number; rows?: number } | null;

      if (socket?.readyState === WebSocket.OPEN && terminal?.cols && terminal.rows) {
        socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
      }
    });
  }, [active]);

  return (
    <section className="xterm-panel">
      <div className="browser-terminal-toolbar">
        <span>PTY terminal</span>
        <span className={`terminal-status terminal-status-${status === "opencode-connected" ? "ready" : status === "error" ? "error" : "starting"}`}>
          {status === "opencode-connected" ? "connected" : status === "terminal-connected" ? "starting agent" : status}
        </span>
      </div>
      <div ref={hostRef} className="xterm-host" />
    </section>
  );
}

type TerminalLike = {
  rows: number;
  cols: number;
  loadAddon(addon: unknown): void;
  open(element: HTMLElement): void;
  focus(): void;
  write(data: string): void;
  writeln(data: string): void;
  onData(listener: (data: string) => void): void;
};
