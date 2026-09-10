import { NextResponse } from "next/server";
import { z } from "zod";

import { sendEmailReport } from "@/server/email";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  reportId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email report send request" }, { status: 400 });
  }

  const deliveryLog = await sendEmailReport(parsed.data.reportId);
  return NextResponse.json({ deliveryLog });
}
