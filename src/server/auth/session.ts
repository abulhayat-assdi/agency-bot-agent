import { jwtVerify, SignJWT } from "jose";

import { SESSION_DURATION_SECONDS } from "@/server/auth/constants";
import { getSessionSecret } from "@/server/auth/secrets";

export type SessionUser = {
  id: string;
  email: string;
  role: "admin";
  agencyId: string;
};

export type AuthSession = {
  user: SessionUser;
  issuedAt: string;
};

function getEncodedSecret(secret = getSessionSecret()) {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser, secret?: string): Promise<string> {
  const issuedAt = new Date();

  return new SignJWT({
    user,
    issuedAt: issuedAt.toISOString()
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getEncodedSecret(secret));
}

export async function verifySessionToken(token: string | undefined, secret?: string): Promise<AuthSession | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getEncodedSecret(secret));
    const user = payload.user as SessionUser | undefined;
    const issuedAt = payload.issuedAt as string | undefined;

    if (!user?.id || !user.email || user.role !== "admin" || !user.agencyId || !issuedAt) {
      return null;
    }

    return { user, issuedAt };
  } catch {
    return null;
  }
}
