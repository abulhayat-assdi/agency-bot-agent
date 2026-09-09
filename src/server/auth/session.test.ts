import { describe, expect, it } from "vitest";

import { createSessionToken, verifySessionToken } from "./session";

const testSecret = "test-session-secret-at-least-thirty-two-characters";

const user = {
  id: "admin-1",
  email: "admin@example.com",
  role: "admin" as const,
  agencyId: "agency-1"
};

describe("session tokens", () => {
  it("creates and verifies a signed admin session", async () => {
    const token = await createSessionToken(user, testSecret);
    const session = await verifySessionToken(token, testSecret);

    expect(session?.user).toEqual(user);
    expect(session?.issuedAt).toEqual(expect.any(String));
  });

  it("rejects tokens signed with another secret", async () => {
    const token = await createSessionToken(user, testSecret);
    const session = await verifySessionToken(token, "different-session-secret-at-least-thirty-two-characters");

    expect(session).toBeNull();
  });
});
