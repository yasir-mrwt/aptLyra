import { test, expect, afterEach } from "@jest/globals";
import { getResumeCallbackUrl } from "./services/queue/steps/callbackUrl.js";
const id = "12345678-1234-1234-1234-123456789abc";
afterEach(() => { delete process.env.BACKEND_URL; process.env.NODE_ENV = "test"; });
test("trusted local callback and HTTPS production callback", () => {
  process.env.BACKEND_URL = "http://localhost:5001/";
  expect(getResumeCallbackUrl(id)).toBe(`http://localhost:5001/api/resume/webhook/process-resume/${id}`);
  process.env.NODE_ENV = "production"; process.env.BACKEND_URL = "https://backend.example.test";
  expect(getResumeCallbackUrl(id)).toContain("https://backend.example.test/");
});
test.each(["file:///tmp/file", "http://user:password@localhost:5001", "http://localhost:5001/path", "http://localhost:5001?key=x"])("bad callback configuration rejects %s", value => {
  process.env.BACKEND_URL = value; expect(() => getResumeCallbackUrl(id)).toThrow();
});
test("production HTTP and non-UUID callback ID reject", () => {
  process.env.NODE_ENV = "production"; process.env.BACKEND_URL = "http://localhost:5001";
  expect(() => getResumeCallbackUrl(id)).toThrow();
  process.env.NODE_ENV = "test";
  expect(() => getResumeCallbackUrl("../other-route")).toThrow();
});
