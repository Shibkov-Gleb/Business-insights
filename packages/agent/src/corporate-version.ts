import { createHash } from "node:crypto";
import { db } from "@context/db";
import { config, hackConfig } from "@context/config";
export async function corporateAnalysisKey() {
  const materials = await db.bankMaterial.findMany({
    where: { status: { in: ["ready", "partial"] } },
    orderBy: { sha256: "asc" },
    select: {
      sha256: true,
      publishedAt: true,
      dateStatus: true,
      status: true,
      id: true,
    },
  });
  const pages = await db.bankPage.findMany({
    where: { materialId: { in: materials.map((m) => m.id) } },
    orderBy: [{ materialId: "asc" }, { page: "asc" }],
    select: { materialId: true, page: true, numericVerified: true },
  });
  return createHash("sha256")
    .update(
      JSON.stringify({
        algorithm:
          config.APP_MODE === "live" ? "alfa-2026-live-v2" : "alfa-2026-v1",
        reasoningEffort:
          config.APP_MODE === "live"
            ? hackConfig.HACKATHON_REASONING_EFFORT
            : null,
        mode: config.APP_MODE,
        extract:
          config.APP_MODE === "demo"
            ? "deterministic"
            : hackConfig.HACKATHON_EXTRACT_MODEL,
        reason:
          config.APP_MODE === "demo"
            ? "deterministic"
            : hackConfig.HACKATHON_REASON_MODEL,
        materials,
        pages,
      }),
    )
    .digest("hex");
}
