"use client";
import { useEffect, useRef, useState } from "react";
export const nodeLabels: Record<string, string> = {
  context: "Контекст бизнеса",
  interpret: "Интерпретация для компании",
  refine: "Уточнение запроса и оснований",
  bank_ocr: "Распознавание банковского материала",
  chat_context: "Контекст и основания ответа",
  chat_answer: "Подготовка ответа помощника",
  plan: "План исследования",
  retrieve: "Поиск и источники",
  extract: "Извлечение фактов",
  compare: "Сравнение версий",
  verify: "Проверка оснований",
  brief: "Аналитическая записка",
  compose_brief: "Аналитическая записка",
  persist: "Сохранение",
  fetch_extract: "Чтение публикаций",
  cluster: "Объединение событий",
  assess: "Оценка влияния",
  finalize: "Сохранение результата",
};
export function useLiveJob(runId: string | undefined, refresh: () => void) {
  const callback = useRef(refresh);
  callback.current = refresh;
  const [progress, setProgress] = useState(""),
    [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (!runId) return;
    setProgress("В очереди");
    setFallback(false);
    let polling: ReturnType<typeof setInterval> | undefined;
    const stream = new EventSource(`/api/v1/jobs/${runId}/events`);
    const stopPolling = () => {
      if (polling) clearInterval(polling);
      polling = undefined;
      setFallback(false);
    };
    const completed = () => {
      stopPolling();
      stream.close();
      callback.current();
    };
    stream.onopen = stopPolling;
    stream.onerror = () => {
      setFallback(true);
      if (!polling) polling = setInterval(() => callback.current(), 3000);
    };
    stream.addEventListener("progress", (e) => {
      const data: { node?: string; status?: string } = JSON.parse(
        (e as MessageEvent).data,
      );
      if (data.node) setProgress(nodeLabels[data.node] || data.node);
    });
    stream.addEventListener("completed", completed);
    stream.addEventListener("snapshot", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (["succeeded", "failed", "partial", "cancelled"].includes(data.status))
        completed();
    });
    stream.addEventListener("failed", completed);
    return () => {
      stream.close();
      if (polling) clearInterval(polling);
    };
  }, [runId]);
  return { progress, fallback };
}
