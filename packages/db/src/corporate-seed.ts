import { db, json } from "./index.ts";
import { config } from "@context/config";
import argon2 from "argon2";
import { digest } from "../../agent/src/sources.ts";
if (config.APP_VARIANT !== "alfa") throw new Error("HACKATHON_VARIANT_REQUIRED");
const passwordHash = await argon2.hash("Alfa-hackathon-2026!", { type: argon2.argon2id });
const accounts = ["founder@example.test", "cfo@example.test", "treasurer@example.test", "restricted@example.test"];
const users = await Promise.all(accounts.map(email => db.user.upsert({ where: { email }, create: { email, passwordHash, verified: true }, update: {} })));
const org = await db.organization.upsert({ where: { id: "aaaaaaaa-2026-4000-8000-000000000001" }, create: { id: "aaaaaaaa-2026-4000-8000-000000000001", name: "Альфа-Бизнес · демонстрационный контур", stage: "established", description: "Моделируемая интеграция интернет-банка. Доступ к клиентам предоставляется явно; роль не изменяет права." }, update: {} });
for (const [index, user] of users.entries()) await db.membership.upsert({ where: { orgId_userId: { orgId: org.id, userId: user.id } }, create: { orgId: org.id, userId: user.id, role: index === 0 ? "owner" : "analyst", allScopes: true }, update: {} });
const samples = [
  { externalId: "synthetic-metal", name: "Северный металл · синтетический", groupId: "DEMO-INDUSTRY", revenue: "42000000000", industry: "Производство стали и проката", okved: "24.10", debt: "1.0", trade: "1.0", region: "Свердловская область" },
  { externalId: "synthetic-food", name: "АгроКонтур · синтетический", groupId: "DEMO-INDUSTRY", revenue: "28500000000", industry: "Производство пищевых продуктов", okved: "10.89", debt: "0.0", trade: "0.0", region: "Краснодарский край" },
  { externalId: "synthetic-logistics", name: "Меридиан Логистика · синтетический", groupId: "DEMO-LOGISTICS", revenue: "19200000000", industry: "Деятельность автомобильного грузового транспорта", okved: "49.41", debt: "1.0", trade: "1.0", region: "Москва" },
];
const imported = await db.corporateCompany.findMany({ where: { datasetId: { not: null }, unknown: false, conflicts: { isEmpty: true } }, orderBy: { revenue: "desc" }, take: 8 });
const all = [];
for (const [i, sample] of samples.entries()) {
  const fields = { MAINOKVED_CODE: sample.okved, MAINOKVED_NAME: sample.industry, REVENUE_COMPANY: sample.revenue, REGION: sample.region, CITY: sample.region, CL_PRODUCT_LOA_MARK: sample.debt, FTS_FLAG: sample.trade, CL_PRODUCT_RKO_MARK: "1.0", CL_PRODUCT_DEP_MARK: i === 1 ? "1.0" : "0.0", CL_PRODUCT_GAR_MARK: "1.0", CL_PRODUCT_LEA_MARK: "0.0", CL_PRODUCT_ZPP_MARK: "1.0", ECO_MARK_LABEL: "Оптимизация", AMOUNT_WORKERS_FNS_GRADATION: "1001–5000", COMPANY_AGE_YEARS_GRADATION: "Более 10 лет" };
  all.push(await db.corporateCompany.upsert({ where: { externalId: sample.externalId }, create: { externalId: sample.externalId, name: sample.name, groupId: sample.groupId, revenue: sample.revenue, fields: json(fields), synthetic: true }, update: {} }));
}
all.push(...imported);
for (const [i, company] of all.entries()) {
  let scopeId = company.scopeId;
  if (!scopeId) { const scope = await db.analysisScope.create({ data: { orgId: org.id, name: company.name, isDefault: i === 0 } }); scopeId = scope.id; await db.corporateCompany.update({ where: { id: company.id }, data: { orgId: org.id, scopeId } }); }
  for (const [j, user] of users.entries()) {
    if (j === 3 && i !== 0) continue;
    await db.companyGrant.upsert({ where: { userId_companyId: { userId: user.id, companyId: company.id } }, create: { userId: user.id, companyId: company.id, canEdit: j !== 3, role: (["owner", "cfo", "treasurer", "employee"] as const)[j], interests: j === 2 ? ["liquidity", "fx"] : [] }, update: {} });
  }
  if (!company.synthetic) continue;
  const headlines = [
    ["Денежно-кредитные условия остаются жёсткими", "Синтетическая новость: регулятор сохранил ключевую ставку, отметив риски инфляции. Новые корпоративные заимствования и рефинансирование требуют сценарной проверки; условия действующих договоров различаются."],
    ["Меняется порядок валютных расчётов и поставок", "Синтетическая новость: участники рынка сообщают об увеличении сроков отдельных трансграничных расчётов и логистических маршрутов. География и применимость к конкретному договору требуют уточнения."],
    ["Новые требования к налоговой отчётности", "Синтетическая новость: опубликован проект изменения налоговой отчётности компаний. Это проект, окончательные сроки и применимость необходимо подтвердить по официальному нормативному источнику."],
    ["Спрос в промышленности восстанавливается неравномерно", "Синтетическая новость: отраслевые участники отмечают разнонаправленную динамику заказов. Ситуация различается по сегментам и клиентам, поэтому агрегированный показатель не доказывает рост выручки конкретной компании."],
  ];
  for (const [title, text] of headlines) await db.corporateNews.upsert({ where: { companyId_sha256: { companyId: company.id, sha256: digest(text) } }, create: { companyId: company.id, title, text, sha256: digest(text), origin: "fixture", synthetic: true, createdBy: users[0].id, publishedAt: new Date("2026-10-23T09:00:00Z") }, update: {} });
}
const demoDataset = await db.datasetImport.upsert({ where: { sha256: digest("context-alfa-synthetic-payments-v1") }, create: { sha256: digest("context-alfa-synthetic-payments-v1"), kind: "synthetic", filename: "Собственные синтетические платёжные связи", status: "ready", rows: 4, settings: { paymentUnit: "RUB", paymentPeriod: "Демонстрационный срез, период не задан" }, report: { synthetic: true } }, update: {} });
for (const [i, row] of [{ payer: samples[0].externalId, beneficiary: samples[2].externalId, amount: "900000000.125000", count: 42n }, { payer: samples[0].externalId, beneficiary: "synthetic-unknown-supplier", amount: "100000000", count: 12n }, { payer: samples[1].externalId, beneficiary: samples[2].externalId, amount: "150000000", count: 32n }, { payer: samples[1].externalId, beneficiary: samples[0].externalId, amount: "140000000", count: 28n }].entries()) await db.paymentEdge.upsert({ where: { datasetId_sourceRow: { datasetId: demoDataset.id, sourceRow: i + 2 } }, create: { datasetId: demoDataset.id, sourceRow: i + 2, ...row }, update: {} });
console.log(JSON.stringify({ stage: "seed", companies: all.length, accounts: accounts.length, paidResearch: false }));
await db.$disconnect();
