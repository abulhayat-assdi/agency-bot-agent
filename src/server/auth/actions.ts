"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { getExpiredSessionCookieOptions } from "@/server/auth/cookies";

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", getExpiredSessionCookieOptions());
  redirect("/login");
}
