# Umbraco.Parity.Tool

Crawls every published page on the upgraded v17 site and compares it with the same page on the original v13 site. Both sites must run against the same content snapshot, so any difference is the upgrade's fault, not an editor's.

## What each page is checked for

| Check | Fails when v17… |
|---|---|
| Status and redirects | returns a different status code, or redirects somewhere v13 didn't |
| Error text | contains an exception message, a missing partial view, or migration leftovers: `{localLink:`, `umb://` references, raw `<umb-rte-block>` markup, `UMBRACO_MACRO` |
| JS errors | throws uncaught errors or logs console errors that v13 didn't |
| Sub-requests | gets new 4xx/5xx responses or failed requests (broken media, scripts, CSS) |
| Content and structure | has a different accessibility tree: headings, text, links and their URLs, image alt text, lists, form fields. This is where TinyMCE → TipTap differences and missing blocks show up |
| Media | references different images, crops, srcsets, videos or embeds. Cache-buster parameters (`rnd=`, `v=`) are ignored; crop parameters are kept |
| Pixels (optional) | looks different in a full-page screenshot (`VISUAL=1`) |

Health checks compare against v13 rather than demanding zero errors, so problems that already existed on v13 don't fail the run.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # set V13_URL and V17_URL
```

## Run

```bash
npm run inventory   # build data/urls.json from v17's sitemap + Delivery API
npm run baseline    # capture v13 into baseline/
npm run compare     # check v17 against baseline/
npm run report      # open the HTML report with diffs
npm run logs        # optional: Error/Fatal entries in v17's Umbraco log during the compare run
```

For the first run on a new site, set `PER_TYPE_LIMIT=3` to crawl three pages per document type. Tune `parity.config.ts` until the noise is gone, then run the full crawl. Keep `PER_TYPE_LIMIT` and `URL_FILTER` identical between baseline and compare.

`URL_FILTER` takes a regex matched against the path or document type alias, so you can re-run one area: `URL_FILTER=blogPost npm run compare`. Document types come from the Delivery API; pages found only in the sitemap show no type.

## Tuning per site

Everything site-specific lives in `parity.config.ts`:

- `ignoreSelectors` removes regions that legitimately differ between runs: live feeds, random carousels, "latest news", cookie banners. You can also add `data-parity-ignore` to markup.
- `errorPatterns` should include the heading of the site's own error page, since a friendly 500 page often returns 200.
- `ignoreRequestPatterns` silences third-party scripts.
- `originAliases` covers a CDN host that serves `/media`.

Add pages the inventory can't find (search results, paginated listings, the 404 page) to `data/urls.extra.txt`.

## Logs

`npm run logs` uses an Umbraco API user (client ID starting `umbraco-back-office-`) to read v17's log through the Management API. The token endpoint is the documented one. The log-viewer path and query parameters haven't been tested against a live v17 instance yet: if the call returns 404 or 400, check `/umbraco/swagger` and adjust `LOGS_PATH` in `scripts/check-logs.ts`.

## Limits

- Multi-site installs and culture variants with domains: run the inventory once per site, using `DELIVERY_START_ITEM` and `DELIVERY_CULTURES`, or list the URLs in `urls.extra.txt`.
- Member-protected pages need a logged-in storage state; this crawl runs anonymously.
- This covers what the frontend renders. Backoffice editing (Block List, Block Grid and TipTap round-trips) and the content/media API integrity pass are the next layers.
