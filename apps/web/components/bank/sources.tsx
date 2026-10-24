"use client";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { CorporateEvidence } from "@context/contracts";
import { bankPageSchema } from "@context/contracts";
import { Modal } from "../shared";
import { bankApi, dateRu } from "./api";
export function BankSource({
  evidence,
  companyId,
  close,
}: {
  evidence: CorporateEvidence | null;
  companyId: string;
  close: () => void;
}) {
  const e = evidence;
  const page = useQuery({
    queryKey: ["bank-page", e?.sourceId, e?.page],
    enabled: e?.kind === "bank",
    queryFn: () =>
      bankApi(bankPageSchema, `/materials/${e!.sourceId}/pages/${e!.page}`),
  });
  const source = useQuery({
    queryKey: ["corporate-evidence", companyId, e?.sourceId, e?.kind],
    enabled: !!e && e.kind !== "bank",
    queryFn: () =>
      bankApi(
        z.unknown(),
        `/companies/${companyId}/evidence?kind=${e!.kind === "csv" ? "csv" : e!.kind === "news" ? "news&sourceId=" + e!.sourceId : "calculation"}`,
      ),
  });
  return (
    <Modal open={!!e} onClose={close} title="Основание материала" side>
      {e && (
        <div className="bank-source">
          <p className="bank-kicker">
            {e.kind === "bank"
              ? "Документ Альфа-Банка"
              : e.kind === "news"
                ? "Внешнее событие"
                : e.kind === "csv"
                  ? "Исходный CSV"
                  : "Контекст и расчёт"}
          </p>
          <h2>{e.title}</h2>
          <p>
            {dateRu(e.publishedAt)}{" "}
            {e.page ? `· страница ${e.page}` : e.row ? `· запись ${e.row}` : ""}
          </p>
          <blockquote>{e.quote}</blockquote>
          <p className="bank-note">
            {e.confidence === "verified"
              ? "Цитата проверена по сохранённому источнику"
              : "OCR или дата требуют проверки"}
            {e.historical
              ? ". Исторический материал — не текущая позиция банка."
              : "."}
          </p>
          {e.kind === "bank" ? (
            <>
              <a
                className="bank-link"
                href={`/api/v1/bank/materials/${e.sourceId}/original#page=${e.page}`}
                target="_blank"
                rel="noreferrer"
              >
                Открыть оригинал PDF ↗
              </a>
              {page.data && (
                <>
                  <p>
                    OCR: {page.data.method} · качество{" "}
                    {Math.round(page.data.quality)} / 100.{" "}
                    {page.data.numericVerified
                      ? "Числа сверены."
                      : "Распознанные числа не подтверждены."}
                  </p>
                  <details>
                    <summary>Текст страницы и координаты OCR</summary>
                    <pre>{page.data.text}</pre>
                    <p>
                      Сохранено {page.data.boxes.length} слов с координатами и
                      confidence.
                    </p>
                  </details>
                </>
              )}{" "}
              {page.error && (
                <p role="alert">
                  Не удалось загрузить страницу: {page.error.message}
                </p>
              )}
            </>
          ) : (
            <>
              {e.url && (
                <a
                  className="bank-link"
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Публичный первоисточник ↗
                </a>
              )}
              <details>
                <summary>Сохранённая версия и происхождение</summary>
                <pre>
                  {source.data
                    ? JSON.stringify(source.data, null, 2)
                    : source.error
                      ? source.error.message
                      : "Загрузка…"}
                </pre>
              </details>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
