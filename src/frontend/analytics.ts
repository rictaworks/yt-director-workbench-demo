/** Activation requires a reviewed change with evidence listed in WORK/common-shell-review.md. */
export const analyticsPolicy = {
  measurementId: 'G-C04W1XKS16',
  origin: 'https://yt-director-workbench-demo.rictaworks.jp',
  streamPrivacyVerified: false,
} as const;

type TagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  'ga-disable-G-C04W1XKS16'?: boolean;
};

/** No application data is accepted by this adapter. No tag loads before verification and consent. */
export class Analytics {
  readonly available: boolean;
  private win: TagWindow;
  private doc: Document;
  private loaded = false;
  private granted = false;

  constructor(win: Window, doc: Document, streamPrivacyVerified: boolean = analyticsPolicy.streamPrivacyVerified) {
    this.win = win as TagWindow; this.doc = doc;
    this.available = streamPrivacyVerified && win.location.origin === analyticsPolicy.origin;
  }
  get consented(): boolean { return this.granted; }
  allow(): void {
    if (!this.available || this.granted) return;
    this.granted = true;
    this.win['ga-disable-G-C04W1XKS16'] = false;
    if (!this.loaded) {
      this.loaded = true;
      this.win.dataLayer = [];
      const tagWindow = this.win;
      tagWindow.gtag = function (..._args: unknown[]): void { tagWindow.dataLayer!.push(arguments); };
      tagWindow.gtag('consent', 'default', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      });
      tagWindow.gtag('js', new Date());
      tagWindow.gtag('consent', 'update', {analytics_storage: 'granted'});
      tagWindow.gtag('config', analyticsPolicy.measurementId, {
        send_page_view: false,
        page_location: `${analyticsPolicy.origin}/`, page_referrer: '', page_title: 'Director Workbench（デモ版）',
        allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: 'none',
      });
      const script = this.doc.createElement('script');
      script.async = true; script.referrerPolicy = 'no-referrer';
      script.src = `https://www.googletagmanager.com/gtag/js?id=${analyticsPolicy.measurementId}`;
      this.doc.head.append(script);
    } else {
      this.win.gtag?.('consent', 'update', {analytics_storage: 'granted'});
    }
    this.win.gtag?.('event', 'page_view', {
      send_to: analyticsPolicy.measurementId,
      page_location: `${analyticsPolicy.origin}/`, page_referrer: '', page_title: 'Director Workbench（デモ版）',
    });
  }
  deny(): void {
    this.granted = false;
    this.win['ga-disable-G-C04W1XKS16'] = true;
    // Disable collection before updating consent; preserve the application's session cookie and draft state.
    if (this.loaded) this.win.gtag?.('consent', 'update', {analytics_storage: 'denied'});
    for (const name of ['_ga', '_ga_C04W1XKS16']) {
      this.doc.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; SameSite=Lax`;
    }
  }
}
