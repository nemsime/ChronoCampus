export type Row = Record<string, any>;
export interface Account {
  id: number;
  email: string;
  display_name: string;
  role: "admin" | "lecturer" | "student";
  must_change_password: boolean;
}
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
    public requestId?: string,
  ) {
    super(typeof detail === "string" ? detail : "request_failed");
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    reportClientError("network_error");
    throw error;
  }
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      response.status,
      data?.detail ?? "request_failed",
      response.headers.get("X-Request-ID") || undefined,
    );
  }
  return data as T;
}

let diagnosticPage = "unknown";
let lastClientReport = 0;
export function setDiagnosticPage(page: string) {
  diagnosticPage = page;
}
const sourceModules = new Set([
  "Application",
  "Planner",
  "Diagnostics",
  "DiagnosticBoundary",
  "Accounts",
  "Catalogs",
  "Schedule",
  "Feedback",
  "common",
  "api",
  "i18n",
]);
function clientFrames(error: unknown) {
  const stack = error instanceof Error ? error.stack || "" : "";
  const frames: { source: string; line: number; column: number }[] = [];
  for (const match of stack
    .slice(0, 16000)
    .matchAll(/(https?:\/\/[^\s)]+):(\d+):(\d+)/g)) {
    try {
      const url = new URL(match[1]);
      if (url.origin !== window.location.origin) continue;
      const module = url.pathname.match(
        /^\/src\/system\/([A-Za-z]+)\.tsx?$/,
      )?.[1];
      const source =
        module && sourceModules.has(module)
          ? module
          : /^\/assets\/[^/]+\.js$/.test(url.pathname)
            ? "bundle"
            : null;
      if (source)
        frames.push({
          source,
          line: Math.min(Number(match[2]), 1000000),
          column: Math.min(Number(match[3]), 1000000),
        });
      if (frames.length === 12) break;
    } catch {
      /* Ignore unrecognized source locations. */
    }
  }
  return frames;
}
export function reportClientError(
  code:
    | "render_error"
    | "javascript_error"
    | "unhandled_rejection"
    | "network_error",
  error?: unknown,
) {
  if (!csrf || Date.now() - lastClientReport < 5000) return;
  lastClientReport = Date.now();
  // Send only known module names and line numbers, never raw stacks/messages/URLs.
  void fetch("/api/diagnostics/client-errors", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify({
      code,
      page: diagnosticPage,
      frames: clientFrames(error),
      source_request_id:
        error instanceof ApiError ? error.requestId : undefined,
    }),
  }).catch(() => {});
}
