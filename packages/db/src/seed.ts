import { db, json } from "./index.ts";
import argon2 from "argon2";
import { config } from "@context/config";
if (config.APP_MODE !== "demo") throw new Error("Demo seed запрещён в live");
const passwordHash = await argon2.hash("Context-demo-2026!", {
  type: argon2.argon2id,
});
const owner = await db.user.upsert({
  where: { email: "founder@example.test" },
  update: {},
  create: { email: "founder@example.test", passwordHash, verified: true },
});
await db.user.upsert({
  where: { email: "reader@example.test" },
  update: {},
  create: { email: "reader@example.test", passwordHash, verified: true },
});
const projects = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Линия",
    stage: "idea",
    description:
      "B2B SaaS для автоматизации аналитики и отчётности небольших команд. Проверяем спрос, изучаем аудиторию и гипотезы; выручки пока нет.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Тихая полка",
    stage: "early_revenue",
    description:
      "Небольшой товарный бизнес: локальный бренд товаров для дома. Продажи через интернет-магазин и маркетплейсы, зависимость от поставщиков и логистики.",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Меридиан",
    stage: "growth",
    description:
      "Компания с несколькими направлениями: программные интеграции B2B и поставки оборудования. Раздельные команды продуктов и закупок.",
  },
];
for (const p of projects) {
  await db.organization.upsert({ where: { id: p.id }, update: {}, create: p });
  await db.membership.upsert({
    where: { orgId_userId: { orgId: p.id, userId: owner.id } },
    update: {},
    create: { orgId: p.id, userId: owner.id, role: "owner" },
  });
  if (
    !(await db.analysisScope.findFirst({
      where: { orgId: p.id, isDefault: true },
    }))
  )
    await db.analysisScope.create({
      data: { orgId: p.id, name: "Общий обзор", isDefault: true },
    });
  if (
    !(await db.profileVersion.findFirst({
      where: { orgId: p.id, scopeId: null },
    }))
  )
    await db.profileVersion.create({
      data: {
        orgId: p.id,
        version: 1,
        createdBy: owner.id,
        fields: json({
          description: {
            value: p.description,
            origin: "user",
            assertion: "confirmed",
            confirmedBy: owner.id,
            date: "2026-10-23T09:00:00Z",
          },
          audience: {
            value: "Небольшие команды и основатели",
            origin: "user",
            assertion: "hypothesis",
            date: "2026-10-23T09:00:00Z",
          },
          goal: {
            value: "Проверить востребованность решения",
            origin: "user",
            assertion: "confirmed",
            date: "2026-10-23T09:00:00Z",
          },
        }),
      },
    });
}
for (const name of ["Продукт", "Закупки"])
  if (
    !(await db.analysisScope.findFirst({
      where: { orgId: projects[2].id, name },
    }))
  )
    await db.analysisScope.create({ data: { orgId: projects[2].id, name } });
for (const project of projects) {
  const scope = await db.analysisScope.findFirstOrThrow({ where: { orgId: project.id, isDefault: true } });
  for (const [name, domain] of [["Орбита · demo", "orbita.example.test"], ["Контур команды · demo", "team-contour.example.test"], ["Пульс · demo", "pulse.example.test"]]) {
    await db.competitor.upsert({ where: { scopeId_identity: { scopeId: scope.id, identity: domain } }, update: {}, create: { orgId: project.id, scopeId: scope.id, identity: domain, name, data: json({ domain, type: "direct", reason: "Синтетический пример для знакомства с рыночной разведкой", sources: [] }), decision: "confirmed", monitoring: "active", fingerprint: "demo-research-v1" } });
  }
}
console.log(
  "Demo: три синтетических проекта. Аккаунты и демонстрационный пароль описаны в README.",
);
await db.$disconnect();
