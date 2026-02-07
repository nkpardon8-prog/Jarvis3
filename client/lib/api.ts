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

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, json?: unknown) =>
    request<T>(path, { method: "POST", json }),
  put: <T = unknown>(path: string, json?: unknown) =>
    request<T>(path, { method: "PUT", json }),
  patch: <T = unknown>(path: string, json?: unknown) =>
    request<T>(path, { method: "PATCH", json }),
  delete: <T = unknown>(path: string) =>
    request<T>(path, { method: "DELETE" }),
};
