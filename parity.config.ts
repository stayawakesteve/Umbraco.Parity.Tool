/**
 * Site-specific tuning. Expect to edit this per client site.
 */
export const parity = {
  /** Removed from the DOM before snapshots: live feeds, carousels, cookie banners, timestamps. */
  ignoreSelectors: [
    '[data-parity-ignore]',
    '#onetrust-consent-sdk',
    '#CybotCookiebotDialog',
  ],

  /** Masked in screenshots only (VISUAL=1). */
  maskSelectors: ['video', 'iframe'],

  /** Clicked (if visible) before capture, e.g. a cookie "Accept" button. */
  consentSelector: process.env.CONSENT_SELECTOR ?? '',

  /**
   * Checked against the full HTML of every page. A match counts as a page error.
   * Add your site's own 500/error page heading here.
   */
  errorPatterns: [
    /An unhandled exception occurred while processing the request/i,
    /Boot Failed/,
    /Cannot bind source type .+ to model type/i,
    /ModelBindingException/,
    /The partial view '.+' was not found/i,
    /Could not find a partial view for (block|the block)/i,
    /RuntimeBinderException|NullReferenceException|InvalidOperationException/,
    // Content that didn't go through a value converter after migration
    /\{localLink:/,
    /umb:\/\/(document|media|element)\//,
    /<umb-rte-block/,
    /UMBRACO_MACRO/,
  ] as RegExp[],

  /** Requests ignored by the network health checks. */
  ignoreRequestPatterns: [
    /google-analytics\.com/,
    /googletagmanager\.com/,
    /doubleclick\.net/,
    /hotjar\.com/,
    /clarity\.ms/,
    /facebook\.(com|net)/,
    /linkedin\.com/,
  ] as RegExp[],

  /** Media query-string keys that matter (ImageSharp / crops). Everything else, e.g. rnd= or v=, is dropped. */
  mediaQueryKeys: ['width', 'height', 'rmode', 'mode', 'crop', 'cc', 'rxy', 'format', 'quality', 'anchor', 'center', 'bgcolor'],

  /** Extra origins to treat as "this site", e.g. a CDN host serving /media. */
  originAliases: [] as string[],

  /** Regex replacements applied to every text snapshot. */
  scrubPatterns: [
    [/[?&](?:v|rnd|cb|cachebuster)=[\w.-]+/g, ''],
  ] as [RegExp, string][],

  /** Paths never crawled. */
  excludePaths: [/^\/umbraco\b/i, /^\/install\b/i, /\.(xml|txt|json)$/i] as RegExp[],

  visual: process.env.VISUAL === '1',
};
