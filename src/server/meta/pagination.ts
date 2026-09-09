import type { MetaPage, MetaPaging } from "@/server/meta/types";

export function paginate<T>(rows: T[], paging: MetaPaging = {}): MetaPage<T> {
  const limit = Math.max(1, Math.min(paging.limit ?? 50, 100));
  const offset = paging.after ? Number.parseInt(Buffer.from(paging.after, "base64url").toString("utf8"), 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const data = rows.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + data.length;
  const hasNext = nextOffset < rows.length;
  const before = Buffer.from(String(Math.max(0, safeOffset - limit))).toString("base64url");
  const after = hasNext ? Buffer.from(String(nextOffset)).toString("base64url") : undefined;

  return {
    data,
    paging: {
      cursors: { before, after },
      next: after
    }
  };
}
