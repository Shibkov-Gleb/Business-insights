import { z } from "zod";
import { api } from "../shared";
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().optional(),
  });
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
