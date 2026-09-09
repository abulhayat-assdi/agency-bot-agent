import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-lg">
        <CardContent className="p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">404</p>
          <h1 className="mt-3 text-3xl font-bold">Report surface not found</h1>
          <p className="mt-3 text-muted-foreground">
            The requested analytics route does not exist or is not available in this milestone.
          </p>
          <Button asChild className="mt-6">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
