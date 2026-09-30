/** Where `extraction/api.py` listens when started with `python api.py`. */
export const DEFAULT_EXTRACT_API_URL = "http://127.0.0.1:8000";

/**
 * The extraction API's base URL: `VITE_EXTRACT_API_URL` if set (e.g. in
 * `.env.local`), else the server's own default. A trailing slash is dropped
 * so paths can be appended as `${url}/extract`.
 */
export function resolveExtractApiUrl(configured: string | undefined): string {
  const url = configured?.trim() || DEFAULT_EXTRACT_API_URL;
  return url.replace(/\/+$/, "");
}

export const EXTRACT_API_URL = resolveExtractApiUrl(import.meta.env.VITE_EXTRACT_API_URL);
