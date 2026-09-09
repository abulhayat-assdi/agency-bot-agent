import { NextResponse } from "next/server";
import { z } from "zod";

import { answerAiQuestion } from "@/server/ai";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().min(1).max(800),
  accountId: z.string().optional(),
  adId: z.string().optional(),
  preset: z
    .enum(["today", "yesterday", "last_3_days", "last_7_days", "last_14_days", "last_28_days", "last_30_days", "this_month", "last_month"])
    .optional()
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI analyst request" }, { status: 400 });
  }

  const result = await answerAiQuestion(parsed.data);
  return NextResponse.json(result);
}
