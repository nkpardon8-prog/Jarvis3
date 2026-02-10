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
};
