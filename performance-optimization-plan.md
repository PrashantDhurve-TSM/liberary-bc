# Performance Optimization Plan

This plan tracks measurement-led performance work for LibraryHub. It is a
backlog, not a claim that the listed changes have already been benchmarked.
Record a baseline before changing behavior or adding infrastructure.

## Principles

- Keep correct catalog availability, permissions, and loan rules ahead of
  micro-optimizations.
- Measure representative member and admin workflows using production-like data.
- Optimize the slow query or render shown by profiling; avoid speculative
  caching, memoization, and abstractions.
- Preserve API response shapes unless a versioned API change is agreed.

## Backend

### In place

- Catalog lists are paginated, with a maximum page size of 100.
- Catalog list queries use field projections; read-only catalog results use
  `lean()` where suitable.
- Search uses the book text index; book/category/copy schemas declare indexes
  for their common filters.
- New-arrival results have a bounded limit.
- Admin loan lists are paginated; circulation schemas index member/status,
  overdue, and reservation-queue lookups. Multi-document writes use transactions
  for consistency; their latency has not yet been benchmarked.
- Admin fine and payment lists are paginated, with member/status/date filters
  and aggregate fine totals; performance has not yet been measured.

### Planned

1. **Capture a baseline**
   - Measure p50/p95/p99 latency and error rate for catalog search, category
     filtering, book detail, and admin book lists.
   - Record response sizes, MongoDB query duration, and the number of database
     operations per request.
   - Use a seeded data set that includes enough books and copies to expose
     realistic pagination and search behavior.
2. **Verify query plans**
   - Run MongoDB `explain("executionStats")` for the supported catalog filters
     and sorts.
   - Confirm production indexes are created through a migration/deployment
     process; production currently disables automatic index creation.
   - Add or revise an index only when the query plan and measurements justify
     it, then measure write cost as well.
3. **Reduce avoidable database work**
   - Keep list endpoints projected and paginated.
   - Watch for count/list queries or category lookups that dominate request
     time; consider an alternate count strategy only if exact pagination
     metadata is not required by the UI.
   - Batch or transact future multi-document circulation operations where the
     data invariants require it.
4. **Consider caching only with evidence**
   - First identify repeatable, read-heavy data and define an invalidation rule.
   - Cache category metadata or catalog responses only if measured latency or
     database load warrants it; invalidate on catalog/category writes.
   - Do not cache per-member eligibility or copy availability without a
     correctness-safe invalidation strategy.

## Frontend

### Implemented; measurement pending

- Route elements are loaded with `React.lazy` and `Suspense` so page code is
  split from the initial application bundle. Compare built chunk sizes and
  route navigation latency before claiming a measurable improvement.
- Authentication remains in Redux; dashboard/report responses and form state
  stay local to their pages to avoid duplicate server state.
- Admin catalog search is debounced and superseded requests are cancelled to
  avoid unnecessary server work and stale results.
- API-backed member and admin screens handle loading, empty, and error states.

### Planned

1. Measure route bundle size and load time, then compare the lazy-loaded build
   and route navigation latency.
2. Profile expensive list/detail renders before adding `memo`, `useMemo`, or
   `useCallback`; retain memoization only when it reduces measured work without
   making state flow harder to follow.
3. Test loading, empty, error, and stale-data behavior after any caching or
   state-management change.

## Acceptance checks

- Compare before/after measurements using the same data set, environment, and
  request mix.
- Confirm catalog filters, sort order, pagination, and availability counts
  remain correct.
- Run backend build, lint, focused unit tests, and relevant API tests.
- Document the measured result and any regression before marking a backlog item
  complete.
