# Backend Modularization and Quality Plan

Status legend:
- `Not Started`
- `In Progress`
- `Completed`
- `Blocked`

## Top Priorities

| ID | Improvement | Status |
| --- | --- | --- |
| BQ-01 | Split `app/db.py` into focused modules (`connection`, `schema`, repositories). | Not Started |
| BQ-02 | Add proper DB lifecycle and pooling (`psycopg_pool`) with app lifespan wiring. | Not Started |
| BQ-03 | Move schema evolution out of runtime boot to migrations (Alembic). | Not Started |
| BQ-04 | Introduce service layer between routes and repositories. | Completed |
| BQ-05 | Replace raw dict payloads with Pydantic request/response models. | Completed |

## Important Quality Improvements

| ID | Improvement | Status |
| --- | --- | --- |
| BQ-06 | Unify endpoint execution model (consistent sync vs async approach). | Not Started |
| BQ-07 | Decouple auth/session rotation side effects from request auth guard. | Not Started |
| BQ-08 | Use native DB types for temporal fields (`timestamptz`, `date`) instead of text. | Not Started |
| BQ-09 | Add structured logging and error observability (request IDs, traces, diagnostics). | Not Started |
| BQ-10 | Abstract cache/rate limiter interfaces for pluggable distributed backends. | Not Started |
| BQ-11 | Clean up rate limiter internals (dead code, stale key eviction). | Not Started |
| BQ-12 | Remove duplicated utility logic (e.g., repeated ISO datetime parsing). | Not Started |

## DevX and Testability

| ID | Improvement | Status |
| --- | --- | --- |
| BQ-13 | Add stronger DB integration test harness (fixtures, transaction strategy). | Not Started |
| BQ-14 | Keep root endpoint route list DRY (derive from source of truth). | Not Started |
| BQ-15 | Reduce startup/config duplication with smaller setup modules and settings object. | Not Started |
