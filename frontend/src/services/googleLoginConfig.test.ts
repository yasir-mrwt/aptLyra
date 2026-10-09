import { describe, expect, it } from "vitest";
import { isValidGoogleClientId } from "./googleLoginConfig";

describe("Google sign-in configuration", () => {
  it("rejects missing and placeholder client IDs without mounting the widget", () => {
    expect(isValidGoogleClientId(undefined)).toBe(false);
    expect(isValidGoogleClientId("your_google_client_id_here")).toBe(false);
  });

  it("accepts a configured Google OAuth web client ID", () => {
    expect(isValidGoogleClientId("123456789-example.apps.googleusercontent.com")).toBe(true);
  });
});
