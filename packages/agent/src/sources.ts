import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { createHash } from "node:crypto";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import Parser from "rss-parser";
import { config } from "@context/config";
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function canonicalUrl(raw: string) {
  const u = new URL(raw);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}
export function allowedAddress(address: string) {
  try {
    const a = ipaddr.process(address);
    return a.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateUrl(raw: string, blocked: string[] = []) {
  const u = new URL(raw);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port)) ||
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    blocked.some((d) => u.hostname === d || u.hostname.endsWith("." + d))
  )
    throw new Error("SOURCE_BLOCKED");
  return u;
}
export type RetrievedSource = {
  id?: string;
  url: string;
  title: string;
  text: string;
  publisher: string;
  language: string;
  publishedAt: string | null;
  status: string;
  synthetic?: boolean;
  eventKey?: string;
  tags?: string[];
  relatedSources?: RetrievedSource[];
};
export interface PageFetcher {
  fetch(
    url: string,
    signal?: AbortSignal,
    blocked?: string[],
  ): Promise<{ url: string; body: string; contentType: string }>;
}
export class SafePageFetcher implements PageFetcher {
  async fetch(raw: string, signal?: AbortSignal, blocked: string[] = []) {
    let url = raw;
    const timeout = AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(signal ? [signal] : []),
    ]);
    for (let redirect = 0; redirect <= 5; redirect++) {
      const u = validateUrl(url, blocked),
        addresses = await lookup(u.hostname.replace(/^\[|\]$/g, ""), {
          all: true,
        });
      if (
        !addresses.length ||
        addresses.some((a) => !allowedAddress(a.address))
      )
        throw new Error("SOURCE_BLOCKED");
      const chosen = addresses[0];
      const result = await new Promise<{
        body: string;
        location?: string;
        type: string;
        status: number;
      }>((resolve, reject) => {
        const request = (u.protocol === "https:" ? https : http).get(
          u,
          {
            signal: timeout,
            headers: {
              "User-Agent": "ContextResearch/1.0",
              Accept: "text/html,application/rss+xml,application/xml",
              "Accept-Encoding": "identity",
            },
            lookup: ((_host: unknown, _opts: unknown, cb: any) => {
              if ((_opts as any)?.all) cb(null, [chosen]);
              else cb(null, chosen.address, chosen.family);
            }) as any,
          },
          (res) => {
            if (
              res.headers["content-encoding"] &&
              res.headers["content-encoding"] !== "identity"
            ) {
              res.destroy();
              reject(new Error("UNSUPPORTED_ENCODING"));
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (b: Buffer) => {
              size += b.length;
              if (size > 8 * 1024 * 1024) {
                res.destroy();
                reject(new Error("SOURCE_TOO_LARGE"));
              } else chunks.push(b);
            });
            res.on("error", reject);
            res.on("end", () =>
              resolve({
                body: Buffer.concat(chunks).toString("utf8"),
                location: res.headers.location,
                type: String(res.headers["content-type"] || ""),
                status: res.statusCode || 500,
              }),
            );
          },
        );
        request.on("error", reject);
      });
      if (result.status >= 300 && result.status < 400 && result.location) {
        url = new URL(result.location, u).toString();
        continue;
      }
      if (result.status < 200 || result.status >= 300)
        throw new Error("SOURCE_UNAVAILABLE");
      return { url, body: result.body, contentType: result.type };
    }
    throw new Error("TOO_MANY_REDIRECTS");
  }
}
export const pageFetcher = new SafePageFetcher();
export async function extractPage(
  source: RetrievedSource,
  signal?: AbortSignal,
  blocked: string[] = [],
) {
  const page = await pageFetcher.fetch(source.url, signal, blocked);
  if (!page.contentType.includes("html")) throw new Error("UNSUPPORTED_PAGE");
  const $ = load(page.body);
  $("script,style,nav,header,footer,noscript,iframe,form").remove();
  let url = canonicalUrl(page.url);
  const canonical = $("link[rel=canonical]").attr("href");
  if (canonical) {
    const c = new URL(canonical, page.url);
    if (c.hostname === new URL(page.url).hostname)
      url = canonicalUrl(c.toString());
  }
  const date =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time[datetime]").first().attr("datetime");
  return {
    ...source,
    url,
    title: $("title").text().trim() || source.title,
    text: ($("article").text() || $("main").text() || $("body").text())
      .replace(/\s+/g, " ")
      .slice(0, 100000),
    publishedAt:
      date && !isNaN(Date.parse(date))
        ? new Date(date).toISOString()
        : source.publishedAt,
    status: "available",
  };
}
export interface SearchProvider {
  search(
    query: string,
    from: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<RetrievedSource[]>;
}
export class BraveSearch implements SearchProvider {
  async search(query: string, from: string, to: string, signal?: AbortSignal) {
    if (!config.BRAVE_SEARCH_API_KEY) throw new Error("SEARCH_NOT_READY");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.search = new URLSearchParams({
      q: query,
      count: "10",
      freshness: from.slice(0, 10) + "to" + to.slice(0, 10),
    }).toString();
    const response = await fetch(url, {
      headers: { "X-Subscription-Token": config.BRAVE_SEARCH_API_KEY },
      signal,
    });
    if (!response.ok) throw new Error("SEARCH_PROVIDER_ERROR");
    const body = (await response.json()) as any;
    return (body.web?.results || []).map((x: any) => ({
      url: x.url,
      title: x.title,
      text: x.description || "",
      publisher: new URL(x.url).hostname,
      language: "unknown",
      publishedAt:
        x.page_age && !isNaN(Date.parse(x.page_age))
          ? new Date(x.page_age).toISOString()
          : null,
      status: "snippet_only",
    }));
  }
}
export async function readRss(
  url: string,
  signal?: AbortSignal,
  blocked: string[] = [],
): Promise<RetrievedSource[]> {
  const page = await pageFetcher.fetch(url, signal, blocked);
  const feed = await new Parser().parseString(page.body);
  return feed.items
    .filter((x) => x.link)
    .slice(0, 100)
    .map((x) => ({
      url: x.link!,
      title: x.title || "Без заголовка",
      text: x.contentSnippet || "",
      publisher: feed.title || new URL(url).hostname,
      language: "unknown",
      publishedAt: x.isoDate || null,
      status: "snippet_only",
    }));
}
