const TOKEN_KEY = "utlaan_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Noe gikk galt (${res.status}).`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body?.detail) && body.detail.length) {
      message = body.detail
        .map((d: { loc?: string[]; msg?: string }) => d.msg || "Ugyldig verdi")
        .join(". ");
    }
  } catch {
    /* behold standardmeldingen */
  }
  return new ApiError(res.status, message);
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const token = auth ? getToken() : null;

  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };
  if (rest.body && !(rest.body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: finalHeaders,
    cache: "no-store",
  });

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;

  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

/** Laster ned en fil fra API-et med innlogget token. */
export async function download(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await toError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
