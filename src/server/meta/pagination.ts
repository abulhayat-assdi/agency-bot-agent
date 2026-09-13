import type { MetaPage, MetaPaging } from "@/server/meta/types";

export const DEFAULT_MAX_PAGES = 50;
export const DEFAULT_PAGE_SIZE = 100;

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

export type BoundedPaginationResult<T> = {
  rows: T[];
  pagesFetched: number;
  truncated: boolean;
};

export async function fetchAllPagesBounded<T>(
  fetchPage: (paging?: MetaPaging) => Promise<MetaPage<T>>,
  options: { maxPages?: number; pageSize?: number } = {}
): Promise<BoundedPaginationResult<T>> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? DEFAULT_MAX_PAGES, 500));
  const pageSize = Math.max(1, Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, 500));
  const rows: T[] = [];
  let after: string | undefined;
  let pagesFetched = 0;
  let truncated = false;

  do {
    const page = await fetchPage({ limit: pageSize, after });
    rows.push(...page.data);
    pagesFetched += 1;
    after = page.paging.cursors.after;
    if (!after) break;
    if (pagesFetched >= maxPages) {
      truncated = true;
      break;
    }
    if (page.data.length === 0) break;
  } while (after);

  return { rows, pagesFetched, truncated };
}
