# LibraryHub Backend

LibraryHub is a library-management API for the member portal and staff console. It manages books and physical copies, catalog search, members, authentication, circulation, reservations, fines, payments, reports, settings, and audit history.

The backend is an ESM NestJS application. It serves the API under `/api` and stores application data in MongoDB.

## What the backend uses

| Area | Technology | Purpose |
| --- | --- | --- |
| HTTP framework | NestJS 12 | Modules, controllers, dependency injection, guards, pipes, and filters |
| Runtime | Node.js with native ESM | Runs TypeScript output with `.js` import extensions |
| Database | MongoDB | Document storage for users, books, copies, loans, reservations, fines, payments, settings, and audit logs |
| ODM | Mongoose 9 with `@nestjs/mongoose` | Schemas, indexes, validation, queries, population, and database connection management |
| Authentication | Passport JWT and `@nestjs/jwt` | Short-lived access tokens and refresh-token sessions |
| Password security | `bcryptjs` | Password hashing and verification |
| Validation | `class-validator`, `class-transformer` | DTO validation, transformation, whitelisting, and rejection of unknown fields |
| File import/export | ExcelJS | Member workbook import and circulation CSV/XLSX-related workflows |
| Testing | Vitest, Supertest, Nest testing utilities | Unit and HTTP integration tests |
| Code quality | Prettier and Oxlint | Formatting and linting |

The current implementation uses application-managed JWT authentication and bcrypt password hashing. External identity providers such as FusionAuth, WorkOS, LoginRadius, and Snyk are not runtime dependencies of this backend; they should not be treated as configured integrations unless they are added to the code and environment configuration.

## Project structure

```text
src/
├── auth/         Login, registration, JWT guards, roles, refresh and logout
├── catalog/      Books, categories, physical copies, public catalog and admin catalog
├── circulation/  Borrowing, issuing, returns, renewals, reservations and scheduler
├── common/       Filters, security helpers, notifications and shared infrastructure
├── configs/      Environment, CORS, validation and MongoDB configuration
├── database/     Mongoose connection module
├── enums/        Shared roles, membership types and statuses
├── operations/   Member/admin dashboards, reports and audit logs
├── payments/     Fines, demo payments, cash collection and receipts
├── settings/     Library circulation policy
└── user/         User management and member profile endpoints
```

Each feature is organized into NestJS modules with controllers, services, repositories, DTOs, and Mongoose entities. Controllers handle HTTP concerns, services apply business rules, and repositories perform database operations.

## Local setup

Requirements:

- Node.js compatible with the project TypeScript and NestJS versions
- MongoDB running locally or a reachable MongoDB deployment
- npm

Install dependencies and start the API:

```bash
npm install
npm run start:dev
```

The development server listens on `http://localhost:3000` and the API base URL is:

```text
http://localhost:3000/api
```

Production build and start:

```bash
npm run build
npm run start:prod
```

## Environment configuration

Create a `.env` file in the backend root. Never commit real secrets.

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP port | `3000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/libraryhub` |
| `CORS_ORIGIN` | Frontend origin used by the deployment | `http://localhost:5173` |
| `JWT_ACCESS_SECRET` | Secret used to sign access tokens | long random value |
| `JWT_REFRESH_SECRET` | Secret used to sign refresh tokens | different long random value |
| `JWT_ACCESS_EXPIRES` | Access-token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES` | Refresh-token lifetime | `7d` |
| `COOKIE_SAMESITE` | Cookie SameSite policy | `strict` |
| `ADMIN_EMAIL` | Optional first-admin bootstrap account | `admin@example.com` |
| `ADMIN_PASSWORD` | Password for the bootstrap admin | strong secret |
| `LIBRARIAN_EMAIL` | Optional first-librarian bootstrap account | `librarian@example.com` |
| `LIBRARIAN_PASSWORD` | Password for the bootstrap librarian | strong secret |

On startup, configured admin and librarian accounts are provisioned only when the corresponding staff account does not already exist. Use strong, unique secrets outside local development.

## Application lifecycle

`src/main.ts` creates the Nest application and configures:

1. The global `/api` prefix.
2. CORS with credentials support.
3. A global `ValidationPipe` with transformation, whitelist filtering, and rejection of non-whitelisted request fields.
4. Global HTTP and application exception filters for consistent error responses.
5. The request logging middleware.
6. The MongoDB connection and feature modules.

## Roles and access

The role enum contains:

- `member`: member portal access, catalog browsing, borrowing, reservations, loans, fines, payments, and profile management.
- `librarian`: staff console access to circulation and operational workflows.
- `admin`: all staff features plus user management, settings, waivers, audit logs, and administrative controls.

Authentication is applied with `AuthGuard`. `RolesGuard` and the `@Roles()` decorator restrict staff and admin endpoints. A member token cannot access staff-only routes.

## Main workflows

### Member workflow

1. A member registers and selects `student`, `faculty`, or `public` membership.
2. The member signs in and receives access and refresh tokens.
3. The catalog can be searched by title, author, ISBN, category slug, and availability.
4. If a physical copy is available, the member borrows it; otherwise, the member creates a reservation.
5. A librarian issues the requested copy at the desk unless self-checkout is enabled.
6. The member can view active loans, renew eligible loans, or request a return.
7. The librarian completes the physical return. Late, damaged, or lost copies can create fines.
8. The member can view fine history and record a demo payment. Demo payments do not charge money.

### Staff workflow

1. Staff sign in through the admin login endpoint.
2. The dashboard loads circulation totals, overdue loans, and recent activity.
3. Staff look up a member and a book copy before issuing a book.
4. The API validates account status, active-loan limits, unpaid-fine limits, copy availability, and reservation state.
5. Issue and return operations update the loan, copy, book availability, member statistics, reservations, and fines.
6. Staff manage reservation queues and can notify or cancel reservations.
7. Staff collect cash fines, while admins can waive eligible fines.
8. Admins can create staff accounts, update library policy, inspect reports, and review audit logs.

### Circulation rules

The default policy is stored in the library settings collection and can be changed by an admin:

- Default loan days: 14 for students and public members; 30 for faculty.
- Default maximum renewals: 2.
- Default renewal extension: 7 days.
- Default overdue fine: ₹5 per day.
- Fine, loan, renewal, reservation-hold, and unpaid-balance limits are policy-driven.
- Suspended members, members over their active-loan limit, and members over the unpaid-fine limit cannot borrow.
- A scheduler periodically marks overdue loans and processes expired reservation holds.

## API reference

All paths below are relative to `/api`. Protected endpoints require:

```http
Authorization: Bearer <access-token>
```

### Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | Register a member |
| `POST` | `/auth/register/member` | Public | Register a member alias |
| `POST` | `/auth/login` | Public | Member login |
| `POST` | `/auth` | Public | Login alias |
| `POST` | `/auth/admin/login` | Public | Staff login |
| `POST` | `/auth/refresh` | Public | Rotate/refresh an access token |
| `POST` | `/auth/logout` | Authenticated | Revoke the current session |
| `POST` | `/auth/register/librarian` | Admin | Create a librarian through the auth workflow |
| `POST` | `/auth/admin/create/librarian` | Admin | Librarian creation alias |
| `POST` | `/auth/admin/create` | Admin | Create an admin account |

### Member profile and dashboard

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/me` | Get the authenticated member profile |
| `PATCH` | `/me` | Update member profile and notification preferences |
| `POST` | `/me/change-password` | Change the authenticated user password |
| `GET` | `/me/dashboard` | Dashboard counters, current loans, and new arrivals |

### Public catalog

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/books` | Search, paginate, and filter public books |
| `GET` | `/books/new-arrivals` | Get recently added active books |
| `GET` | `/books/:id` | Get a book detail and availability |
| `GET` | `/categories` | List category options and slugs |

Common `/books` query parameters include `q`, `category`, `availability`, `page`, and `limit`. Category filters accept the category slug used by the frontend, such as `computer-science`.

### Member circulation

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/me/loans?status=active` | Active, pending, issued, and overdue loans |
| `GET` | `/me/loans?status=history` | Returned and lost loan history, including populated fines |
| `GET` | `/me/reservations` | Member reservation records |
| `POST` | `/books/:id/borrow` | Borrow or request a book |
| `POST` | `/books/:id/reserve` | Join a reservation queue |
| `POST` | `/loans/:id/renew` | Renew an eligible loan |
| `POST` | `/loans/:id/return-request` | Request a return |
| `DELETE` | `/reservations/:id` | Cancel a member reservation |

### Member fines and payments

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/me/fines` | Fine items and total outstanding balance |
| `POST` | `/payments/demo` | Record a non-monetary demo payment for selected fines |
| `GET` | `/me/payments` | Member payment history |
| `GET` | `/payments/:id/receipt` | Get a paid payment receipt |

Amounts are stored as integer paise. For example, `10000` represents ₹100.00.

### Admin catalog and categories

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/admin/books` | Admin book listing with filters and pagination |
| `POST` | `/admin/books` | Create a book and its physical copies |
| `GET` | `/admin/books/:id` | Get an admin book detail |
| `PATCH` | `/admin/books/:id` | Update book metadata |
| `DELETE` | `/admin/books/:id` | Archive a book when circulation rules allow |
| `POST` | `/admin/books/:id/copies` | Add physical copies |
| `PATCH` | `/admin/copies/:copyId` | Update a copy |
| `POST` | `/admin/categories` | Create a category |
| `PATCH` | `/admin/categories/:id` | Update a category |
| `DELETE` | `/admin/categories/:id` | Delete a category when allowed |
| `GET` | `/admin/books/import-template` | Download the book import template |
| `POST` | `/admin/books/import` | Import books from an `.xlsx` file |
| `GET` | `/admin/categories/import-template` | Download the category import template |
| `POST` | `/admin/categories/import` | Import categories from an `.xlsx` file |

### Admin users and members

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/user` | List users for admin management |
| `POST` | `/user` | Create a staff account with a selected role |
| `POST` | `/user/create/member` | Create a member account |
| `GET` | `/user/:id` | Get a user |
| `PATCH` | `/user/:id` | Update user details or status |
| `DELETE` | `/user/:id` | Remove a user when allowed |
| `GET` | `/user/members/import-template` | Download the member import template |
| `POST` | `/user/members/import` | Import members from an `.xlsx` file |

### Admin circulation and reservations

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/admin/lookup/member?q=...` | Look up a member and borrowing eligibility |
| `GET` | `/admin/lookup/members?q=...` | Search member suggestions |
| `GET` | `/admin/lookup/books?q=...` | Search book/copy suggestions |
| `GET` | `/admin/lookup/copy?barcode=...` | Look up a physical copy and its current loan |
| `POST` | `/admin/loans/issue` | Issue a copy to a member |
| `POST` | `/admin/loans/return` | Return a copy and create applicable fines |
| `POST` | `/admin/loans/:id/renew` | Renew a loan as staff |
| `POST` | `/admin/loans/:id/mark-lost` | Mark a loan/copy lost |
| `GET` | `/admin/loans` | Admin loan listing with filters |
| `GET` | `/admin/loans/overdue` | Overdue loan listing |
| `GET` | `/admin/reservations` | Reservation queue listing |
| `POST` | `/admin/reservations/:id/notify` | Notify a ready reservation |
| `DELETE` | `/admin/reservations/:id` | Cancel an admin reservation |

### Admin fines and payments

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/admin/fines` | List fines with status, member, date, and pagination filters |
| `POST` | `/admin/fines` | Create a manual fine |
| `POST` | `/admin/fines/:id/pay` | Record a cash payment |
| `POST` | `/admin/fines/:id/waive` | Waive a payable fine; admin-only policy applies |
| `GET` | `/admin/payments` | List payments for staff reporting |

### Dashboards, reports, settings, and audit history

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/admin/dashboard` | Admin dashboard statistics and recent activity |
| `GET` | `/admin/reports/circulation?range=week\|month` | Circulation chart data |
| `GET` | `/admin/reports/most-borrowed` | Most-borrowed books |
| `GET` | `/admin/reports/overdue` | Overdue report |
| `GET` | `/admin/reports/fines` | Fine and payment totals |
| `GET` | `/admin/reports/members` | Member trend report |
| `GET` | `/admin/reports/categories` | Category distribution |
| `GET` | `/admin/reports/export` | Export circulation data |
| `GET` | `/admin/audit-logs` | Admin-only audit history |
| `GET` | `/admin/settings` | Read circulation policy |
| `PATCH` | `/admin/settings` | Update circulation policy |

## Data model

The main MongoDB collections are:

- `users`: identity, role, membership type, status, statistics, password/session state, and notification preferences.
- `books`: title-level metadata, category, copy totals, availability, rating, and borrow count.
- `bookcopies`: physical copy barcode and circulation status.
- `loans`: member, book, copy, immutable snapshots, due dates, renewals, return state, and fine reference.
- `reservations`: member/book queue entries, waiting/ready/fulfilled/cancelled/expired status, hold dates, and fulfilled loan.
- `fines`: paise amount, paid amount, status, reason, late days, snapshot, and audit timestamps.
- `payments`: member, allocations, amount, method, receipt, idempotency key, and payment status.
- `notifications`: member-facing alerts for fines, payments, due dates, and reservations.
- `librarysettings`: configurable loan, renewal, fine, borrowing-limit, and reservation policy.
- `auditlogs`: successful administrative changes and their actor/resource metadata.

Snapshots on loans and fines preserve the member and book labels that existed when the event occurred. This keeps historical screens useful even if a user or book is later renamed.

## Optimization and reliability techniques

The backend applies the following techniques:

### Database efficiency

- Mongoose indexes support common lookups on member/status, status/due date, book/category, reservation queues, and unique active-copy constraints.
- Member and category filters normalize identifiers before querying, including ObjectId conversion for relationship fields.
- Read endpoints use `.lean()` where hydrated documents are not required.
- Queries select only fields needed by each screen instead of returning full documents.
- List endpoints paginate and cap page sizes to avoid unbounded responses.
- Related fine data is populated only for loan-history views that need it.

### Concurrent work

- Independent dashboard counts and report queries run with `Promise.all`.
- Aggregation pipelines calculate totals in MongoDB rather than loading every record into Node.js.
- Report data is grouped by date/category in the database where possible.

### Consistency and concurrency protection

- Issue, return, renewal, payment, and reservation operations validate the current document state before updating it.
- Conditional updates use the previous status or paid amount to detect changes made by another request.
- Demo payments require an idempotency key so retrying the same request does not create duplicate payments.
- Partial unique indexes prevent more than one active reservation for the same member and book.
- Physical-copy indexes prevent multiple simultaneous active loans for the same copy.

### Security and validation

- Passwords are hashed with bcrypt and are never returned by user queries.
- Access and refresh tokens use separate secrets and lifetimes.
- Role guards separate member, librarian, and admin privileges.
- DTO validation rejects unknown properties and transforms query values into the expected types.
- CORS is explicitly configured for approved frontend origins and credentials.
- File uploads are limited to `.xlsx` and a 5 MB maximum for member imports.
- Exception filters normalize validation and application errors without exposing sensitive internals.

### Operational behavior

- MongoDB connection pooling uses bounded pool sizes and fail-fast server selection timeouts.
- Development can build indexes automatically; production should manage indexes deliberately during deployment.
- The circulation scheduler updates overdue loans and reservation expirations periodically.
- Audit logs provide traceability for successful administrative changes.

## Testing and quality commands

```bash
npm run build       # Compile the NestJS backend
npm run lint        # Run Oxlint
npm test            # Run Vitest tests
npm run test:cov    # Run tests with coverage
npm run test:e2e    # Run HTTP integration tests
npm run format      # Format source and test files
```

Before committing a backend change, run at least:

```bash
npm run build
npm test
```

For endpoint or authentication changes, also run `npm run test:e2e`.

## Deployment checklist

- Set `NODE_ENV=production`.
- Use a managed MongoDB URI with TLS and appropriate network restrictions.
- Replace all development JWT and bootstrap credentials with long random secrets.
- Set `CORS_ORIGIN` to the deployed frontend origin instead of localhost.
- Confirm the MongoDB deployment supports the consistency guarantees required by the circulation/payment workflows.
- Build with `npm run build` and start with `npm run start:prod`.
- Configure process supervision, structured logs, backups, and health monitoring outside the application.
- Do not commit `.env`, access tokens, refresh tokens, or generated database exports.
