"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            The platform could not load this analytics surface. No data has been modified.
          </p>
        </div>
        <Button onClick={() => reset()}>Try again</Button>
      </CardContent>
    </Card>
  );
}
