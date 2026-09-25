import { redirect } from "next/navigation";

// The chat replaced the old AI Analyst screen.
export default function AiAnalystPage() {
  redirect("/chat");
}
