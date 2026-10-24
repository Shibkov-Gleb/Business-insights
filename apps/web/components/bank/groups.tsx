"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { bankApi } from "./api";
const groupSchema = z.object({
  groupId: z.string(),
  warning: z.string(),
  companies: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      revenue: z.string().nullable(),
      synthetic: z.boolean(),
    }),
  ),
});
export function BankGroups({ query }: { query: string }) {
  const groups = useQuery({
    queryKey: ["corporate-groups"],
    queryFn: () =>
      bankApi(z.object({ items: z.array(groupSchema) }), "/groups"),
  });
  return (
    <div>
      <p className="bank-intro">
        Разрез по группам строится только из явно разрешённых компаний. GROUP_ID
        и связанное физическое лицо не открывают чужие карточки.
      </p>
      {groups.data?.items.map((g) => (
        <section className="bank-group" key={g.groupId}>
          <p className="bank-kicker">ГРУППА ИЗ НАБОРА</p>
          <h2>{g.groupId}</h2>
          <p className="bank-callout">{g.warning}</p>
          {g.companies.map((c) => (
            <Link
              className="bank-group-company"
              href={`/bank/${c.id}/feed${query}`}
              key={c.id}
            >
              <span>
                {c.name}
                <small>
                  {c.synthetic
                    ? "Синтетический профиль"
                    : "Исходный CSV · единицы выручки требуют проверки"}
                </small>
              </span>
              <strong>Повестка компании ↗</strong>
            </Link>
          ))}
        </section>
      ))}
      {groups.error && <p role="alert">{groups.error.message}</p>}
    </div>
  );
}
