# LibraryHub – REST API Specification

Backend API for the LibraryHub UI. Covers every screen in the **Member portal** and **Admin console**, in the order a real user goes through them.

- **Stack:** NestJS + Mongoose, MongoDB, JWT auth, and `class-validator` DTOs. Demo payments record a successful payment without charging money.
- **Base URL:** `/api`
- **Format:** JSON, UTF-8. Dates are ISO-8601 UTC. **Money is in paise** (integer): ₹40 → `4000`
- Schema reference: see `01-mongodb-schema.md`

---

## 1. Conventions

### Authentication
- `Authorization: Bearer <accessToken>` (JWT, 15 min)
- The refresh token is returned in the auth response and sent in the JSON body to `/auth/refresh` (7 days), where it is rotated.
- Roles: `member`, `librarian`, `admin`.

| Marker | Meaning |
|---|---|
| 🌐 | Public |
| 👤 | Any logged-in member |
| 🛠 | `librarian` or `admin` |
| 🔒 | `admin` only |

### Success envelope
```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
```

### Error envelope
```json
{ "success": false, "error": { "code": "BOOK_UNAVAILABLE", "message": "No copies are available", "details": [] } }
```

### Pagination, sorting, search (list endpoints)
`?page=1&limit=20&sort=-createdAt&q=keyword`

### Status codes
`200` OK · `201` Created · `204` No content · `400` Validation · `401` Not logged in · `403` Forbidden · `404` Not found · `409` Conflict · `422` Business rule failed · `429` Rate limited · `500` Server error

### Common error codes
`VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `ACCOUNT_SUSPENDED`, `BOOK_UNAVAILABLE`, `LOAN_LIMIT_REACHED`, `UNPAID_FINES`, `ALREADY_BORROWED`, `ALREADY_RESERVED`, `RENEW_LIMIT_REACHED`, `RENEW_BLOCKED_RESERVED`, `LOAN_NOT_FOUND`, `PAYMENT_FAILED`

---

## 2. Authentication (UI: Login, Register)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | 🌐 | Create member account |
| POST | `/auth/login` | 🌐 | Login any active account |
| POST | `/auth/admin/login` | 🌐 | Login admin or librarian; provisions configured admin on first login |
| POST | `/auth/refresh` | 🌐 | Rotate tokens using refresh token in JSON body |
| POST | `/auth/logout` | 👤 | Revoke refresh token |

Email verification and password recovery are outside the current version and
have no API routes. Signed-in users can change their password through
`POST /me/change-password` after providing their current password.

**POST `/auth/register`**
```json
// request
{ "name": "Aarav Patil", "email": "aarav@mail.com", "phone": "9876543210", "membershipType": "student", "password": "Str0ng@Pass" }
// 201
{ "user": { "memberId": "M-1001", "name": "Aarav Patil", "role": "member", "status": "active" }, "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

**POST `/auth/login`**
```json
// request
{ "email": "aarav@mail.com", "password": "Str0ng@Pass" }
// 200  → frontend redirects: role=member → #u-dash, role=admin|librarian → #a-dash
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "user": { "id": "665f...", "memberId": "M-1001", "name": "Aarav Patil", "role": "member" } }
```
Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED`. Lock the account for 15 min after 5 failed attempts.

Staff accounts are created by an administrator through `POST /auth/register/librarian`
or `POST /auth/admin/create`; those routes return the created account without
issuing a session. The new staff member signs in through `POST /auth/admin/login`.

---

## 3. Member portal

### 3.1 Dashboard (UI: `#u-dash`)

**GET `/me/dashboard`** 👤
```json
{
  "stats": { "borrowed": 3, "dueThisWeek": 1, "reservations": 1, "overdue": 1, "pendingFines": 4000 },
  "currentLoans": [ { "_id": "l1", "snapshot": { "title": "Atomic Habits", "authors": ["James Clear"] }, "dueAt": "2026-11-19T00:00:00Z", "status": "overdue" } ],
  "newArrivals": [ { "_id": "b7", "bookId": "B-0007", "title": "Wings of Fire", "authors": ["A.P.J. Abdul Kalam"], "coverUrl": "..." } ]
}
```
The live response returns active loans with their `snapshot`, `dueAt` and
`status`, plus active catalog books in `newArrivals`.

### 3.2 Catalog and book detail (UI: `#u-catalog`, `#u-book-:id`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/books` | 👤 | Search + filter + paginate |
| GET | `/books/:id` | 👤 | Book detail incl. availability and my status |
| GET | `/categories` | 👤 | Category list for the filter dropdown |
| GET | `/books/new-arrivals` | 👤 | Latest added titles |

**GET `/books`** query params:
`q` (title/author/ISBN), `category` (id or slug), `availability` (`available|all`), `year`, `sort` (`title|-createdAt|-rating.avg|-borrowCount`), `page`, `limit`

```json
{ "data": [ { "id": "b3", "title": "Atomic Habits", "authors": ["James Clear"], "category": "Self Help",
              "coverUrl": "...", "availableCopies": 5, "availability": "available", "rating": { "avg": 4.8, "count": 212 } } ],
  "meta": { "page": 1, "limit": 20, "total": 10, "totalPages": 1 } }
```

**GET `/books/:id`** adds: `description`, `isbn`, `publishedYear`, `shelfLocation`, and a `me` block used to switch the buttons:
```json
"me": { "canBorrow": true, "canReserve": false, "alreadyBorrowed": false, "reservation": null, "wishlisted": false }
```

### 3.3 Borrow, reserve, wishlist (UI: book detail buttons)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/books/:id/borrow` | 👤 | Self-borrow request (see note) |
| POST | `/books/:id/reserve` | 👤 | Join waiting queue |
| DELETE | `/reservations/:id` | 👤 | Cancel my reservation |
| GET | `/me/reservations` | 👤 | My reservations with queue position |
| POST | `/books/:id/wishlist` | 👤 | Add to wishlist |
| DELETE | `/books/:id/wishlist` | 👤 | Remove from wishlist |
| GET | `/me/wishlist` | 👤 | My wishlist |

> **Borrow note:** the UI shows "Book borrowed. Due in 14 days". Two supported modes, switch with a setting `selfCheckout`:
> 1. `selfCheckout = true`: the API issues the loan immediately (kiosk or trusted members).
> 2. `selfCheckout = false` (default): API creates a **pending** loan request; the member collects the book and the librarian confirms it at the desk using `/admin/loans/issue`.

**POST `/books/:id/borrow`** → `201`
```json
{ "data": { "loanId": "l9", "title": "Deep Work", "issuedAt": "2026-11-17T09:00:00Z", "dueAt": "2026-12-01T09:00:00Z" } }
```
Errors: `422 BOOK_UNAVAILABLE`, `422 LOAN_LIMIT_REACHED`, `422 UNPAID_FINES`, `409 ALREADY_BORROWED`.

**POST `/books/:id/reserve`** → `201`
```json
{ "data": { "reservationId": "r4", "queuePosition": 2, "status": "waiting" } }
```
Error: `409 ALREADY_RESERVED`, `422 BOOK_AVAILABLE_BORROW_INSTEAD`.

### 3.4 My loans (UI: `#u-loans`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/me/loans?status=active` | 👤 | Active loans and pending desk requests |
| GET | `/me/loans?status=history` | 👤 | Returned loans with fine amount |
| POST | `/loans/:id/renew` | 👤 | Renew (+7 days) |
| POST | `/loans/:id/return-request` | 👤 | Tell the library you are returning |

**POST `/loans/:id/renew`** → `200`
```json
{ "data": { "loanId": "l1", "oldDueAt": "2026-11-26T00:00:00Z", "newDueAt": "2026-12-03T00:00:00Z", "renewCount": 1, "renewalsLeft": 1 } }
```
Renew rules: not overdue, `renewCount < maxRenewals`, no `waiting` reservations on the book. Errors: `422 RENEW_LIMIT_REACHED`, `422 RENEW_BLOCKED_RESERVED`.

### 3.5 Fines and payments (UI: `#u-fines`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/me/fines` | 👤 | Fines list + totals |
| POST | `/payments/demo` | 👤 | Immediately record a demo payment and settle selected fines |
| GET | `/me/payments` | 👤 | Payment history |
| GET | `/payments/:id/receipt` | 👤 | PDF receipt |

**GET `/me/fines`**
```json
{ "totalDue": 4000, "items": [ { "_id": "665f...", "snapshot": { "title": "Atomic Habits" }, "daysLate": 8, "amount": 4000, "paidAmount": 0, "status": "unpaid" } ] }
```

**Demo payment flow**
1. `POST /payments/demo` with `{ "fineIds": ["<fine-id>"] }` and an
   `Idempotency-Key` header.
2. The API marks the selected fines paid, updates the member balance, records a
   `demo` payment and generates a receipt in one MongoDB transaction.
3. The frontend refreshes the fine and payment lists. No gateway is contacted
   and no money is charged.

The response includes the payment ID, receipt number, amount in paise and paid
status.

This flow is for demonstration only. Do not treat demo payments as real
financial transactions.

### 3.6 Profile and notifications (UI: `#u-profile`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/me` | 👤 | My profile |
| PATCH | `/me` | 👤 | Update name, phone, address, avatar |
| POST | `/me/change-password` | 👤 | `{ currentPassword, newPassword }` |
| GET | `/me/notifications` | 👤 | List (`?unread=true`) |
| PATCH | `/me/notifications/:id/read` | 👤 | Mark one read |
| PATCH | `/me/notifications/read-all` | 👤 | Mark all read |

---

## 4. Admin console

All routes below are prefixed `/admin` and need 🛠 (librarian/admin) unless marked 🔒.

### 4.1 Dashboard (UI: `#a-dash`)

**GET `/admin/dashboard`**
```json
{
  "stats": { "totalBooks": 10240, "members": 1862, "issuedToday": 34, "overdue": 27 },
  "circulation": [ { "date": "2026-11-11", "label": "Tue", "issued": 40, "returned": 33 } ],
  "overdueLoans": [ { "snapshot": { "memberName": "Aarav Patil", "title": "The Pragmatic Programmer" }, "daysLate": 4 } ],
  "recentActivity": [ { "member": "Aarav Patil", "book": "The Pragmatic Programmer", "action": "Issued", "at": "..." } ]
}
```
`totalBooks` counts physical copies in active titles. The dashboard response
includes the five most overdue loans and the five most recently updated loans.

### 4.2 Books (UI: `#a-books`, Add book popup)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/books` | 🛠 | Table with search, category, status filters |
| POST | `/admin/books` | 🛠 | Add book (+ creates N copies with barcodes) |
| GET | `/admin/books/:id` | 🛠 | Detail incl. copies |
| PATCH | `/admin/books/:id` | 🛠 | Edit |
| DELETE | `/admin/books/:id` | 🔒 | Archive (soft delete; blocked if open loans) |
| POST | `/admin/books/:id/copies` | 🛠 | Add more copies |
| PATCH | `/admin/copies/:copyId` | 🛠 | Change status (damaged, lost, withdrawn) |
| GET | `/admin/books/import-template` | 🛠 | Download the Excel workbook template |
| POST | `/admin/books/import` | 🛠 | Bulk import categories and books from `.xlsx` |
| POST | `/admin/categories` | 🛠 | Create category |
| PATCH | `/admin/categories/:id` | 🛠 | Edit category |
| DELETE | `/admin/categories/:id` | 🔒 | Delete (only if empty) |
| POST | `/uploads/cover` | 🛠 | Upload cover image (multipart) |

**POST `/admin/books`**
```json
// request (matches the "Add new book" popup)
{ "title": "Refactoring", "authors": ["Martin Fowler"], "isbn": "9780134757599", "category": "665f...", "totalCopies": 3, "publishedYear": 2018, "shelfLocation": "B-3" }
// 201
{ "data": { "id": "b11", "bookId": "B-0011", "totalCopies": 3, "copies": ["B-0011-1", "B-0011-2", "B-0011-3"] } }
```
Errors: `409 ISBN_EXISTS`, `400 VALIDATION_ERROR`.

The import workbook has `Categories` and `Books` sheets. Categories require a
`name` column and may include `description`. Books require `title`, `authors`,
`category`, and `totalCopies`; `category` matches a category name in the workbook
or an existing category. Authors and tags can be comma- or semicolon-separated.
Each sheet accepts up to 1,000 data rows. Successful rows are kept when another
row fails, and the response includes the created counts and row-level errors.

### 4.3 Members (UI: `#a-members`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/user` | 🔒 | List user accounts (admin only); the member page filters members |
| POST | `/user/create/member` | 🔒 | Create a member with an initial password |
| POST | `/user` | 🔒 | Create an account with the selected role and initial password |
| GET | `/user/:id` | 🔒 | Get an account |
| PATCH | `/user/:id` | 🔒 | Update name, email, phone, or status |
| DELETE | `/user/:id` | 🔒 | Delete an account |

Roles are selected at account creation; there is no role-change endpoint.
Email delivery and password recovery are not part of this version.

### 4.4 Issue and return desk (UI: `#a-issue`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/lookup/member?q=M-1001` | 🛠 | Quick member lookup (limits, fines) before issuing |
| GET | `/admin/lookup/copy?barcode=` | 🛠 | Quick copy/book lookup |
| POST | `/admin/loans/issue` | 🛠 | Issue a book |
| POST | `/admin/loans/return` | 🛠 | Return a book |
| POST | `/admin/loans/:id/renew` | 🛠 | Renew on behalf of member |
| POST | `/admin/loans/:id/mark-lost` | 🛠 | Mark lost, creates fine |
| GET | `/admin/loans` | 🛠 | All loans; filter `status`, `member`, `from`, `to` |
| GET | `/admin/loans/overdue` | 🛠 | Overdue list |

**POST `/admin/loans/issue`** (form: Member ID, Book ID / ISBN, Due date)
```json
// request
{ "memberId": "M-1001", "barcode": "B-0001-2", "dueAt": "2026-12-01" }   // dueAt optional → policy default
// 201
{ "data": { "loanId": "l12", "member": "Aarav Patil", "title": "Clean Code", "issuedAt": "...", "dueAt": "2026-12-01T00:00:00Z" } }
```

**POST `/admin/loans/return`** (form: Book ID / ISBN, Condition)
```json
// request
{ "barcode": "B-0001-2", "condition": "good" }      // good | damaged | lost
// 200
{ "data": { "loanId": "l12", "returnedAt": "...", "fine": { "id": "f7", "daysLate": 3, "amount": 1500 },
            "nextReservation": { "member": "Sneha Joshi", "status": "ready", "holdUntil": "..." } } }
```
`fine` and `nextReservation` are `null` when not applicable. The UI uses them to show "Late fine calculated" and "Next member notified".

### 4.5 Reservations (UI: `#a-reserv`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/reservations` | 🛠 | Queue; filter `status`, `book` |
| POST | `/admin/reservations/:id/notify` | 🛠 | Notify member (Notify button) |
| DELETE | `/admin/reservations/:id` | 🛠 | Cancel (Cancel button), queue re-numbers |

### 4.6 Fines (UI: `#a-fines`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/fines` | 🛠 | Filter `status`, `member`, date range |
| POST | `/admin/fines/:id/pay` | 🛠 | Mark paid / cash at desk, `{ "method": "cash" }` |
| POST | `/admin/fines/:id/waive` | 🔒 | `{ "reason": "First offence" }` |
| POST | `/admin/fines` | 🛠 | Manual fine (damage, etc.) |
| GET | `/admin/payments` | 🛠 | All payments |

`POST /admin/fines` accepts `{ "memberId": "M-1001", "amount": 1000, "reason": "manual", "description": "Replacement charge" }`. Amounts are positive integer paise. Manual fine reasons are `damaged`, `lost`, or `manual`. Waivers are restricted to admins and require a non-empty reason.

### 4.7 Reports (UI: `#a-reports`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/reports/circulation?range=week` | Books issued per day (the bar chart) |
| GET | `/admin/reports/most-borrowed?limit=10` | Most borrowed books |
| GET | `/admin/reports/overdue` | Overdue summary |
| GET | `/admin/reports/fines?from=&to=` | Pending, cash-collected, demo-recorded and waived amounts |
| GET | `/admin/reports/members` | New members per month, by type |
| GET | `/admin/reports/categories` | Active titles by category |
| GET | `/admin/reports/export?type=circulation&format=csv` | CSV export (Export CSV button) |

```json
// GET /admin/reports/circulation?range=week
{ "range": "week", "data": [ { "date": "2026-11-11", "label": "Tue", "issued": 40, "returned": 33 } ] }
```
Use `range=week` for daily data and `range=month` for weekly buckets. All
monetary totals are integer paise. Cash-collected totals exclude demo payments;
demo settlements are returned separately and must not be counted as real money.
The overdue response includes `total` and at most 100 detailed loans.

### 4.8 Settings and audit

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/settings` | 🔒 | Read saved circulation policy |
| PATCH | `/admin/settings` | 🔒 | Update one or more policy values |
| GET | `/admin/audit-logs` | 🔒 | Paginated administrator and librarian changes |

Settings include `selfCheckout`, membership-specific `loanDays` and
`maxActiveLoans`, `maxRenewals`, `renewDays`, fine amounts/limits, and
`reservationHoldHours`. Money fields are integer paise. The first settings
record uses the existing `SELF_CHECKOUT` environment value as its initial
default; later changes are persisted in MongoDB. Existing loans retain the
maximum renewal allowance saved when issued; fee rates and renewal extensions
use the active policy when those actions occur.

```json
// PATCH /admin/settings
{ "loanDays": { "student": 21 }, "finePerDay": 700 }
```

Audit entries are written after successful admin/librarian write requests and
include actor, role, HTTP method, route and optional resource ID. Query them
with `page`, `limit`, `actor`, `resource`, `from` and `to`.

---

## 5. End-to-end flows

### A. New member
`POST /auth/register` → `POST /auth/login` → `GET /me/dashboard`

### B. Borrow a book (typical)
`GET /books?q=clean` → `GET /books/:id` → `POST /books/:id/borrow` → appears in `GET /me/loans?status=active`

### C. Unavailable book
`GET /books/:id` (`canReserve: true`) → `POST /books/:id/reserve` → admin returns another copy → API promotes reservation to `ready` + notification → member collects → admin `POST /admin/loans/issue` → reservation `fulfilled`

### D. Overdue and fine
Minute scheduler marks the loan `overdue` → return at desk → fine created → member `GET /me/fines` → `POST /payments/demo` → fine `paid`

### E. Admin day-to-day
`POST /auth/login` → `GET /admin/dashboard` → `POST /admin/books` → `POST /admin/loans/issue` → `POST /admin/loans/return` → `GET /admin/reports/circulation`

---

## 6. UI action → API mapping (quick reference)

| UI element | Call |
|---|---|
| Member login / Admin login | `POST /auth/login` (redirect by `role`) |
| Register | `POST /auth/register` |
| Catalog search + category filter | `GET /books?q=&category=` |
| Borrow / Reserve / Wishlist | `POST /books/:id/borrow`, `/reserve`, `/wishlist` |
| Renew / Return (My Loans) | `POST /loans/:id/renew`, `/return-request` |
| Pay now (demo) | `POST /payments/demo` |
| Save changes (Profile) | `PATCH /me` |
| Add book (modal) → Save | `POST /admin/books` |
| Edit / Delete (books table) | `PATCH` / `DELETE /admin/books/:id` |
| Suspend / Activate | `PATCH /user/:id` |
| Issue book / Mark returned | `POST /admin/loans/issue` / `/return` |
| Notify / Cancel (reservations) | `POST /admin/reservations/:id/notify` / `DELETE` |
| Mark paid / Waive | `POST /admin/fines/:id/pay` / `/waive` |
| Export CSV | `GET /admin/reports/export` |

---

## 7. Security and non-functional checklist

- Hash passwords with **bcrypt (cost 12)**; never return `passwordHash`.
- Rate limit: `/auth/*` 10 req/min/IP; global 100 req/min/IP.
- `helmet`, strict `CORS` (allow only the UI origin), `express-mongo-sanitize`, request size limit 1 MB.
- Validate request bodies and queries with the configured `class-validator` pipeline.
- Use **MongoDB transactions** for issue, return, and payment settlement.
- Idempotency: require `Idempotency-Key` on `POST /payments/demo` and accept it on `POST /admin/loans/issue`.
- Persist an audit entry after each successful write made by an admin or librarian.
- Clearly label demo payments; they record settlement for display only and do not charge money.
- Soft delete books and members; never hard delete records that have loan history.
- Health check: `GET /health` → `{ "status": "ok" }`. Add OpenAPI/Swagger at `/docs`.

## 8. Five implementation phases

1. **Identity and access (implemented; validation pending):** registration, login and token
   refresh/logout; account lockout; member profile/password changes; role guards.
2. **Catalog (implemented; validation pending):** categories, books, physical copies, admin
   catalog management and member search/detail.
3. **Circulation (implemented; build verified):** member borrow requests, desk issue/return,
   renewals, fines generated by return, reservations and queue transitions.
4. **Fines and payments (implemented; validation pending):** fine listing and manual creation,
   cash collection, waivers, immediate demo-payment recording, receipts and
   payment notifications.
5. **Operations and frontend integration (implemented; validation pending):**
   dashboards, reports, persistent policy settings, audit logs, scheduled
   overdue/reservation processing, and member/admin API-backed screens are
   implemented. Email verification and password recovery are excluded from
   this version. Build and test validation remain to be run.

Each phase should add focused tests before the next phase depends on it. Keep
the existing NestJS modules, DTOs, services, repositories and Mongoose entities
as the implementation structure.

Circulation operations that change a loan, copy, book counter, reservation, or
fine run in MongoDB transactions. The MongoDB deployment must therefore support
transactions (a replica set or sharded cluster). Demo payment settlement also
uses a transaction so a payment record, fine statuses, member balance and
notification stay consistent. Overdue and expired-reservation processing runs once per minute and uses
conditional updates/transactions to avoid duplicate transitions. Dashboard
and report totals are generated from MongoDB data; no sample values are used
by the integrated dashboard and report pages.