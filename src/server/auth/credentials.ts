import { z } from "zod";

import { verifyPassword } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512)
});

export type LoginInput = z.infer<typeof loginSchema>;

export function parseLoginInput(input: unknown) {
  return loginSchema.safeParse(input);
}

export async function validateAdminCredentials(
  input: LoginInput,
  env: Record<string, string | undefined> = process.env
): Promise<SessionUser | null> {
  const expectedEmail = env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
  const passwordHash = env.ADMIN_BOOTSTRAP_PASSWORD_HASH;
  const bootstrapPassword = env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!expectedEmail || input.email !== expectedEmail) {
    return null;
  }

  const passwordMatches = passwordHash
    ? await verifyPassword(input.password, passwordHash)
    : Boolean(bootstrapPassword && input.password === bootstrapPassword);

  if (!passwordMatches) {
    return null;
  }

  return {
    id: "bootstrap-admin",
    email: expectedEmail,
    role: "admin",
    agencyId: "bootstrap-agency"
  };
}
