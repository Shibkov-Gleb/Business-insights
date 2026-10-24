"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { companyContextSchema, type CompanyContext } from "@context/contracts";
import { bankApi } from "./api";
export function ContextEdit({ context }: { context: CompanyContext }) {
  const cache = useQueryClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <details className="bank-context-edit">
      <summary>Подтвердить ручное уточнение</summary>
      <p>
        Исходный CSV сохраняется. Уточнение создаёт новую версию, доступно
        участникам с правом редактирования и не перезаписывается исследованием.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          setNotice("");
          void bankApi(
            companyContextSchema,
            `/companies/${context.id}/context`,
            "PATCH",
            {
              expectedVersion: context.version,
              confirm: true,
              fields: {
                [String(form.get("field"))]: String(form.get("value")),
              },
            },
          )
            .then(async () => {
              setNotice(
                "Уточнение подтверждено. Для новых выводов запустите исследование с новой версией.",
              );
              await cache.invalidateQueries({
                queryKey: ["corporate-context", context.id],
              });
              await cache.invalidateQueries({ queryKey: ["bank-companies"] });
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Признак
          <select name="field">
            <option value="CL_PRODUCT_LOA_MARK">
              Кредиты (1.0 — есть, 0.0 — нет)
            </option>
            <option value="FTS_FLAG">Признак ВЭД (1.0 / 0.0)</option>
            <option value="MAINOKVED_NAME">Основная деятельность</option>
            <option value="REGION">Регион регистрации</option>
            <option value="REVENUE_COMPANY">Выручка в исходных единицах</option>
          </select>
        </label>
        <label>
          Подтверждённое значение
          <input name="value" required minLength={1} maxLength={2000} />
        </label>
        <label className="bank-confirm">
          <input type="checkbox" required />Я проверил значение и подтверждаю
          изменение контекста
        </label>
        <button className="bank-button light" disabled={busy}>
          Подтвердить новую версию
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
