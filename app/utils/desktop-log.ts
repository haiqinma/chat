import { isDesktopAppRuntime, tauriInvoke } from "../tauri";

let installed = false;
let queue = Promise.resolve();

function serialize(value: unknown) {
  if (value instanceof Error)
    return `${value.name}: ${value.message}\n${value.stack || ""}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level: string, values: unknown[]) {
  const message = `[${level}] ${values.map(serialize).join(" ")}`;
  queue = queue
    .then(async () => {
      await tauriInvoke<string>("append_log", { message });
    })
    .catch(() => {});
}

export function installDesktopLogging() {
  if (installed || !isDesktopAppRuntime()) return;
  installed = true;
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...values) => {
    originalError(...values);
    write("ERROR", values);
  };
  console.warn = (...values) => {
    originalWarn(...values);
    write("WARN", values);
  };
  window.addEventListener("error", (event) => {
    write("UNCAUGHT", [
      event.error || event.message,
      event.filename,
      event.lineno,
    ]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    write("UNHANDLED_REJECTION", [event.reason]);
  });
  write("INFO", ["desktop logging initialized"]);
}
