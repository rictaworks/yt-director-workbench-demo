import { HTTP_MESSAGES, requiredMessage, textLengthMessage, numberMessage, choiceMessage } from './messages.ts';
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(400, 'invalid_input', HTTP_MESSAGES.invalidInput);
  return value as Record<string, unknown>;
}

export function text(value: unknown, name: string, max: number, min = 0): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_input', requiredMessage(name));
  const result = value.trim();
  if ([...result].length < min || [...result].length > max) throw new HttpError(400, 'invalid_input', textLengthMessage(name, min, max));
  return result;
}

export function number(value: unknown, name: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new HttpError(400, 'invalid_input', numberMessage(name));
  return value;
}

export function member<T extends string>(value: unknown, choices: readonly T[], name: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new HttpError(400, 'invalid_input', choiceMessage(name));
  return value as T;
}

export function todayJst(now = new Date()): string { return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10); }

export function response(data: unknown, status = 200, cookie?: string): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
  if (cookie) headers['set-cookie'] = cookie;
  return Response.json(data, { status, headers });
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'json_required', HTTP_MESSAGES.jsonRequired);
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'cross_site', HTTP_MESSAGES.crossSite);
  if (Number(request.headers.get('content-length') ?? 0) > 98304) throw new HttpError(413, 'body_too_large', HTTP_MESSAGES.tooLarge);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 98304) { await reader.cancel(); throw new HttpError(413, 'body_too_large', HTTP_MESSAGES.tooLarge); }
      chunks.push(chunk.value);
    }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return object(JSON.parse(new TextDecoder().decode(bytes))); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'invalid_json', HTTP_MESSAGES.invalidJson); }
}

export function sessionCookie(id: string, request: Request, now = new Date()): string {
  const cutoff = new Date(now); cutoff.setUTCHours(18, 0, 0, 0);
  if (cutoff.getTime() <= now.getTime()) cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  const age = Math.max(1, Math.floor((cutoff.getTime() - now.getTime()) / 1000));
  return `dw_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export function sessionId(request: Request): string | null {
  const value = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('dw_session='))?.slice(11);
  return value && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ? value : null;
}
