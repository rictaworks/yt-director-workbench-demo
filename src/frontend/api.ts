import { messages } from './messages.ts';
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = '') {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code;
  }
}
export class ApiClient {
  private fetcher: Fetcher;
  constructor(fetcher: Fetcher = (input, init) => fetch(input, init)) { this.fetcher = fetcher; }
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error(messages.apiOriginError);
    let response: Response;
    try {
      response = await this.fetcher(path, {
        method, credentials: 'same-origin', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
    } catch { throw new ApiError(messages.networkError, 0, 'network_error'); }
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new ApiError(messages.invalidResponse, response.status); }
    if (!response.ok) {
      const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      const error = record.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : record;
      throw new ApiError(typeof error.message === 'string' ? error.message : messages.unknownError,
        response.status, typeof error.code === 'string' ? error.code : typeof record.error === 'string' ? record.error : '');
    }
    return data as T;
  }
}
