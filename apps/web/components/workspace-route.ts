"use client";
import { useSyncExternalStore } from "react";
type Route = { org: string; scope: string; tab: string; filter: string; insight: string; aggregate: string; competitor: string; days: string };
const initial: Route = { org: "", scope: "", tab: "overview", filter: "main", insight: "", aggregate: "", competitor: "", days: "30" };
const subscribe = (callback: () => void) => { window.addEventListener("popstate", callback); window.addEventListener("context:navigate", callback); return () => { window.removeEventListener("popstate", callback); window.removeEventListener("context:navigate", callback); }; };
const location = () => window.location.pathname + window.location.search;
function parse(value: string): Route {
  const url = new URL(value, "http://localhost"), segments = url.pathname.split("/").filter(Boolean);
  const result = { ...initial };
  if (segments[0] === "workspace") { result.org = segments[1] || ""; result.scope = segments[2] || ""; result.tab = segments[3] || "overview"; }
  for (const key of ["filter", "insight", "aggregate", "competitor", "days"] as const) result[key] = url.searchParams.get(key) || initial[key];
  return result;
}
export function useWorkspaceRoute() {
  const value = useSyncExternalStore(subscribe, location, () => "/");
  const route = parse(value);
  const navigate = (patch: Partial<Route>, replace = false) => {
    const next = { ...parse(location()), ...patch };
    const params = new URLSearchParams();
    for (const key of ["filter", "insight", "aggregate", "competitor", "days"] as const) if (next[key] && next[key] !== initial[key]) params.set(key, next[key]);
    const path = next.org ? `/workspace/${next.org}${next.scope ? `/${next.scope}/${next.tab}` : ""}` : "/";
    const url = path + (params.size ? "?" + params.toString() : "");
    if (url !== location()) { window.history[replace ? "replaceState" : "pushState"]({}, "", url); window.dispatchEvent(new Event("context:navigate")); }
  };
  return { route, navigate };
}
