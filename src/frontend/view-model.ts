import { messages, screens } from './messages.ts';
export type ScreenId = typeof screens[number]['id'] | 'legal';
export interface Route { screen: ScreenId; projectId: string }

export function parseRoute(hash: string): Route {
  try {
    const [screen, projectId = ''] = hash.replace(/^#/, '').split('/');
    if (screen === 'legal') return {screen: 'legal', projectId: ''};
    return screens.some(item => item.id === screen)
      ? { screen: screen as ScreenId, projectId: decodeURIComponent(projectId) }
      : { screen: 'home', projectId: '' };
  } catch { return { screen: 'home', projectId: '' }; }
}
export function routeHash(screen: ScreenId, projectId = ''): string {
  if (screen === 'legal') return '#legal';
  return `#${screen}${projectId ? `/${encodeURIComponent(projectId)}` : ''}`;
}
export function normalizeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : messages.unknownError;
}
export function numberFromInput(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function isValidMemo(value: string): boolean {
  const length = Array.from(value.trim()).length;
  return length >= 2 && length <= 500;
}
export function dateInJapan(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
}
export function numberLabel(value: number | null, suffix = ''): string {
  return value === null ? messages.noPrevious : `${new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 2}).format(value)}${suffix}`;
}

/** A navigation or selector change invalidates rendering from an older request. */
export class ViewRevision {
  private revision = 0;
  capture(): number { return this.revision; }
  advance(): void { this.revision += 1; }
  isCurrent(token: number | null): boolean { return token !== null && token === this.revision; }
}
