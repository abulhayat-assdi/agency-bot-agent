import { describe, expect, it } from "vitest";

import { validateAdminCredentials } from "./credentials";
import { hashPassword } from "./password";

describe("admin credentials", () => {
  it("validates bootstrap credentials against a bcrypt hash", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await validateAdminCredentials(
      { email: "admin@example.com", password: "correct-password" },
      {
        ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
        ADMIN_BOOTSTRAP_PASSWORD_HASH: passwordHash
      }
    );

    expect(user).toEqual(
      expect.objectContaining({
        email: "admin@example.com",
        role: "admin"
      })
    );
  });

  it("rejects invalid bootstrap credentials", async () => {
    const user = await validateAdminCredentials(
      { email: "admin@example.com", password: "wrong-password" },
      {
        ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
        ADMIN_BOOTSTRAP_PASSWORD: "correct-password"
      }
    );

    expect(user).toBeNull();
  });
});
