import { z } from "zod";
import { api } from "../shared";
import { useInfiniteQuery } from "@tanstack/react-query";
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().optional(),
  });
export function useBankPages<T>(
  item: z.ZodType<T>,
  path: string,
  queryKey: readonly string[],
) {
  const result = useInfiniteQuery({
    queryKey,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      bankApi(
        z.object({ items: z.array(item), nextCursor: z.string().nullable() }),
        path +
          (path.includes("?") ? "&" : "?") +
          "limit=30" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
  });
  return {
    ...result,
    data: result.data
      ? { items: result.data.pages.flatMap((page) => page.items) }
      : undefined,
  };
}
export async function bankApi<T>(
  schema: z.ZodType<T>,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  return schema.parse(await api("/bank" + path, method, body));
}
export const acceptedSchema = z.object({
  jobId: z.uuid(),
  resourceId: z.string(),
  status: z.string(),
  reused: z.boolean(),
});
export const channelLabels: Record<string, string> = {
  financing: "Финансирование",
  liquidity: "Ликвидность",
  demand: "Спрос",
  supply: "Поставки",
  regulation: "Регулирование",
  fx: "Валюты и ВЭД",
  strategy: "Стратегия",
};
export const dateRu = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Moscow",
      })
    : "Дата неизвестна";
