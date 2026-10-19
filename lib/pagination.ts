export function pageInfo(offset: number, limit: number, total: number, hasNextPage: boolean) {
  return {
    offset,
    limit,
    total,
    nextOffset: hasNextPage ? offset + limit : null,
  };
}
