import { it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({ dns: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.dns }));
vi.mock("node:http", () => ({ default: { get: mocks.get } }));
vi.mock("node:https", () => ({ default: { get: mocks.get } }));
import { SafePageFetcher } from "../../packages/agent/src/sources.ts";
beforeEach(() => {
  mocks.dns.mockReset();
  mocks.get.mockReset();
});
function response(
  status: number,
  headers: Record<string, string> = {},
  body = "ok",
) {
  return (_url: URL, options: any, callback: (res: any) => void) => {
    options.lookup("example.test", {}, (error: unknown, ip: string) => {
      expect(error).toBeNull();
      expect(ip).toBe("8.8.8.8");
    });
    const request = new EventEmitter();
    queueMicrotask(() => {
      const res = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers,
        destroy: vi.fn(),
      });
      callback(res);
      res.emit("data", Buffer.from(body));
      res.emit("end");
    });
    return request;
  };
}
it("redirect на metadata IP блокируется до запроса", async () => {
  mocks.dns
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
    .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
  mocks.get.mockImplementation(
    response(302, { location: "http://169.254.169.254/latest/meta-data" }),
  );
  await expect(
    new SafePageFetcher().fetch("https://public.example.test"),
  ).rejects.toThrow("SOURCE_BLOCKED");
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it("DNS rebinding: сокет использует проверенный IP, без повторного DNS", async () => {
  mocks.dns
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  mocks.get.mockImplementation(response(200, { "content-type": "text/html" }));
  expect(
    (await new SafePageFetcher().fetch("https://public.example.test")).body,
  ).toBe("ok");
  expect(mocks.dns).toHaveBeenCalledTimes(1);
});
it("смешанный публичный и приватный DNS ответ блокируется", async () => {
  mocks.dns.mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]);
  await expect(
    new SafePageFetcher().fetch("https://public.example.test"),
  ).rejects.toThrow("SOURCE_BLOCKED");
  expect(mocks.get).not.toHaveBeenCalled();
});
