/** Loopback-only UI preview. No config/db/provider imports; writes are rejected. */
import { createServer } from "node:http";
import { fixtureResponse } from "../tests/fixtures/bank-ui";
createServer((req, res) => {
  const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const reply = (status: number, data: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (path === "/api/v1/auth/demo" && req.method === "POST") {
    res.setHeader(
      "Set-Cookie",
      "ui-preview=1; HttpOnly; SameSite=Strict; Path=/",
    );
    return reply(200, { ok: true });
  }
  if (req.method !== "GET")
    return reply(405, {
      error: {
        code: "UI_READ_ONLY",
        message: "UI-стенд: запись и внешние вызовы отключены",
        requestId: "ui-preview",
      },
    });
  if (path === "/api/v1/auth/me")
    return req.headers.cookie?.includes("ui-preview=1")
      ? reply(200, {
          id: "55555555-5555-4555-8555-555555555555",
          email: "reviewer@example.test",
        })
      : reply(401, {
          error: {
            code: "UNAUTHENTICATED",
            message: "Войдите в UI-демонстрацию",
            requestId: "ui-preview",
          },
        });
  const data = fixtureResponse(path);
  reply(
    data === undefined ? 404 : 200,
    data ?? {
      error: {
        code: "UI_NOT_FOUND",
        message: "Нет UI fixture",
        requestId: "ui-preview",
      },
    },
  );
}).listen(4012, "127.0.0.1", () =>
  console.log("Synthetic UI API: http://127.0.0.1:4012 · no DB/LLM"),
);
