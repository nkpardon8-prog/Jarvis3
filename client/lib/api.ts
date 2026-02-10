const API_BASE = "/api";

interface ApiOptions extends RequestInit {
  json?: unknown;
}

async function request<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const { json, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  let body = rest.body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      body,
      credentials: "include",
    });

    const data = await res.json();
    return data;
  } catch {
    return { ok: false, error: "Network error. Please check your connection." };
  }
}

/** SSE progress event from server */
export interface ProgressEvent {
  step: string;
  status: "active" | "done" | "error";
  message?: string;
  result?: { ok: boolean; data?: unknown };
}

/**
 * POST with Server-Sent Events for real-time progress.
 * Calls onProgress for each intermediate event, returns the final result.
 */
async function postWithProgress<T = unknown>(
  path: string,
  json: unknown,
  onProgress: (event: ProgressEvent) => void,
  timeoutMs = 180000 // 3-minute global timeout
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(json),
      credentials: "include",
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      // Fallback: non-streaming error
      try {
        const data = await res.json();
        return data;
      } catch {
        return { ok: false, error: `HTTP ${res.status}` };
      }
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: { ok: boolean; data?: T; error?: string } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event: ProgressEvent = JSON.parse(line.slice(6));
            if (event.step === "complete" && event.result) {
              finalResult = event.result as { ok: boolean; data?: T };
            } else if (event.step === "error") {
              finalResult = { ok: false, error: event.message || "Workflow creation failed" };
            } else {
              onProgress(event);
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    }

    return finalResult || { ok: false, error: "No response received" };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timed out. The server may still be processing." };
    }
    return { ok: false, error: "Network error. Please check your connection." };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T = unknown>(path: string, opts?: ApiOptions) => request<T>(path, opts),
  post: <T = unknown>(path: string, json?: unknown, opts?: ApiOptions) =>
    request<T>(path, { method: "POST", json, ...opts }),
  put: <T = unknown>(path: string, json?: unknown, opts?: ApiOptions) =>
    request<T>(path, { method: "PUT", json, ...opts }),
  patch: <T = unknown>(path: string, json?: unknown, opts?: ApiOptions) =>
    request<T>(path, { method: "PATCH", json, ...opts }),
  delete: <T = unknown>(path: string, opts?: ApiOptions) =>
    request<T>(path, { method: "DELETE", ...opts }),
  upload: <T = unknown>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  postWithProgress: <T = unknown>(
    path: string,
    json: unknown,
    onProgress: (event: ProgressEvent) => void
  ) => postWithProgress<T>(path, json, onProgress),
};
