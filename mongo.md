# LibraryHub – MongoDB Schema Design

Backend data model for the LibraryHub UI (Member portal + Admin console). Written for **MongoDB 6+** with **Mongoose**.

## 1. Collections overview

| Collection | Purpose | UI pages that use it |
|---|---|---|
| `users` | Members and admins (one collection, `role` field) | Login, Register, Profile, Admin → Members |
| `books` | Book titles (catalog metadata) | Catalog, Book detail, Admin → Books |
| `bookCopies` | Physical copies of a title (barcode level) | Issue/Return, Availability |
| `categories` | Book categories | Catalog filter, Admin → Books |
| `loans` | Issue / return / renew transactions | My Loans, Dashboard, Admin → Issue & Return |
| `reservations` | Queue for unavailable books | Book detail (Reserve), Admin → Reservations |
| `fines` | Overdue / damage / lost charges | Fines (member + admin) |
| `payments` | Payment records against fines | Fines → Pay now |
| `wishlists` | Saved books per member | Book detail (Wishlist) |
| `notifications` | In-app and email notices | Header bell, Admin → Notify |
| `settings` | Library policy (loan days, fine per day, limits) | Fines, Issue |
| `auditLogs` | Who did what (admin actions) | Reports |
| `counters` | Auto-increment for readable IDs (M-1001, B-0001) | Members, Books |
| `refreshTokens` | Login sessions | Auth |

### Relationship diagram

```
users 1 ──── * loans * ──── 1 bookCopies * ──── 1 books * ──── 1 categories
users 1 ──── * reservations * ──── 1 books
loans 1 ──── 0..1 fines 1 ──── * payments
users 1 ──── * wishlists * ──── 1 books
users 1 ──── * notifications
```

Design rule: **reference** (ObjectId) for relations, **embed** small snapshots (title, member name) in `loans`/`fines` so history and tables stay fast and correct even if a book is later edited or deleted.

Production disables automatic index creation. Before deploying Phase 4, migrate
the existing unique `fines.loan` index to a sparse unique index and create the
idempotency and receipt indexes on `payments`. If indexes from an earlier
gateway-based implementation exist, drop `gatewayOrderId_1`,
`gatewayPaymentId_1`, and `allocations.fine_1`.

---

## 2. Schemas

### 2.1 `users`

```js
const UserSchema = new Schema({
  memberId:     { type: String, unique: true, index: true },          // "M-1001" (admins: "A-0001")
  name:         { type: String, required: true, trim: true, maxlength: 100 },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, trim: true },
  passwordHash: { type: String, required: true, select: false },      // bcrypt, cost 12
  role:         { type: String, enum: ['member', 'librarian', 'admin'], default: 'member', index: true },
  membershipType: { type: String, enum: ['student', 'faculty', 'public'], default: 'student' },
  status:       { type: String, enum: ['active', 'suspended', 'expired', 'pending'], default: 'active', index: true },
  avatarUrl:    String,
  address:      { line1: String, city: String, state: String, pincode: String },
  membershipExpiresAt: Date,
  limits: {                                                           // overrides from settings by membership type
    maxActiveLoans: { type: Number, default: 5 },
    loanDays:       { type: Number, default: 14 }
  },
  stats: {                                                            // denormalised counters for dashboards
    activeLoans:   { type: Number, default: 0 },
    totalBorrowed: { type: Number, default: 0 },
    unpaidFines:   { type: Number, default: 0 }                       // in paise
  },
  emailVerified: { type: Boolean, default: false },
  resetToken:    { type: String, select: false },
  resetTokenExpires: { type: Date, select: false },
  lastLoginAt:   Date
}, { timestamps: true });

UserSchema.index({ name: 'text', email: 'text', memberId: 'text' }); // admin member search
```

**Sample**
```json
{
  "memberId": "M-1001", "name": "Aarav Patil", "email": "aarav@mail.com",
  "role": "member", "membershipType": "student", "status": "active",
  "stats": { "activeLoans": 3, "totalBorrowed": 21, "unpaidFines": 4000 }
}
```

### 2.2 `categories`
  
```js
const CategorySchema = new Schema({
  name: { type: String, required: true, unique: true },   // "Technology"
  slug: { type: String, required: true, unique: true },
  description: String,
  bookCount: { type: Number, default: 0 }
}, { timestamps: true });
```

### 2.3 `books`

```js
const BookSchema = new Schema({
  bookId:    { type: String, unique: true },               // "B-0001"
  title:     { type: String, required: true, trim: true },
  authors:   [{ type: String, required: true }],
  isbn:      { type: String, unique: true, sparse: true },
  category:  { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
  categoryName: String,                                    // snapshot for fast list rendering
  publisher: String,
  publishedYear: Number,
  language:  { type: String, default: 'English' },
  pages:     Number,
  description: String,
  coverUrl:  String,
  tags:      [String],
  shelfLocation: String,                                   // "Rack B-3"
  totalCopies:     { type: Number, default: 1, min: 0 },
  availableCopies: { type: Number, default: 1, min: 0 },   // kept in sync on issue/return
  reservationCount:{ type: Number, default: 0 },
  borrowCount:     { type: Number, default: 0, index: true }, // "Most borrowed" report
  rating:  { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  status:  { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

BookSchema.index({ title: 'text', authors: 'text', isbn: 'text', tags: 'text' }, { weights: { title: 10, authors: 5, tags: 2 } });
BookSchema.index({ category: 1, availableCopies: -1 });
```

Virtual: `availability = availableCopies > 0 ? 'available' : 'borrowed'` (drives the green/red badge in the catalog).

### 2.3.1 `bookCopies`

```js
const BookCopySchema = new Schema({
  book:     { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  barcode:  { type: String, required: true, unique: true },   // scanned at the issue desk
  status:   { type: String, enum: ['available', 'issued', 'reserved', 'damaged', 'lost', 'withdrawn'], default: 'available', index: true },
  condition:{ type: String, enum: ['new', 'good', 'fair', 'poor'], default: 'good' },
  acquiredAt: Date,
  currentLoan: { type: Schema.Types.ObjectId, ref: 'Loan' }
}, { timestamps: true });
```

### 2.4 `loans`

```js
const LoanSchema = new Schema({
  member:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book:    { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  copy:    { type: Schema.Types.ObjectId, ref: 'BookCopy', required: true },
  snapshot: {                                                  // display data frozen at issue time
    memberName: String, memberId: String,
    title: String, authors: [String], barcode: String
  },
  issuedAt:   { type: Date, default: Date.now },
  dueAt:      { type: Date, required: true, index: true },
  returnedAt: Date,
  renewCount: { type: Number, default: 0 },
  maxRenewals:{ type: Number, default: 2 },
  status:     { type: String, enum: ['issued', 'returned', 'overdue', 'lost'], default: 'issued', index: true },
  returnCondition: { type: String, enum: ['good', 'damaged', 'lost'] },
  issuedBy:   { type: Schema.Types.ObjectId, ref: 'User' },     // librarian/admin
  returnedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  returnRequestedAt: Date,                                      // member pressed "Return" in UI
  fine:       { type: Schema.Types.ObjectId, ref: 'Fine' },
  renewals:   [{ renewedAt: Date, oldDueAt: Date, newDueAt: Date }]
}, { timestamps: true });

LoanSchema.index({ member: 1, status: 1 });
LoanSchema.index({ status: 1, dueAt: 1 });                      // overdue cron + admin dashboard
// one copy can only have one open loan
LoanSchema.index({ copy: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['issued', 'overdue'] } } });
```

### 2.5 `reservations`

```js
const ReservationSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book:   { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  snapshot: { memberName: String, title: String },
  queuePosition: { type: Number, required: true },              // 1 = next in line
  status: { type: String, enum: ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'], default: 'waiting', index: true },
  notifiedAt: Date,
  holdUntil:  Date,                                             // ready → member has 48h to collect
  fulfilledLoan: { type: Schema.Types.ObjectId, ref: 'Loan' }
}, { timestamps: true });

// A member can have only one live reservation per book
ReservationSchema.index({ member: 1, book: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['waiting', 'ready'] } } });
ReservationSchema.index({ book: 1, status: 1, queuePosition: 1 });
```

### 2.6 `fines`

```js
const FineSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  loan:   { type: Schema.Types.ObjectId, ref: 'Loan' },          // absent for manual fines
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  snapshot: { memberName: String, title: String },
  reason: { type: String, enum: ['overdue', 'damaged', 'lost', 'manual'], default: 'overdue' },
  daysLate: Number,
  description: String,
  ratePerDay: Number,                                           // paise, from settings
  amount: { type: Number, required: true },                     // paise (₹40 = 4000) – never use floats for money
  paidAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['unpaid', 'partial', 'paid', 'waived'], default: 'unpaid', index: true },
  waivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  waiveReason: String,
  waivedAt: Date,
  paidAt: Date
}, { timestamps: true });

FineSchema.index({ member: 1, status: 1 });
FineSchema.index({ loan: 1 }, { unique: true, sparse: true });
FineSchema.index({ createdAt: -1 });
```

### 2.7 `payments`

```js
const PaymentSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  memberName: { type: String, required: true },                 // receipt snapshot
  allocations: [{ fine: { type: Schema.Types.ObjectId, ref: 'Fine' }, amount: Number }],
  amount: { type: Number, required: true },                     // paise
  method: { type: String, enum: ['demo', 'cash'], required: true },
  status: { type: String, enum: ['paid'], default: 'paid', index: true },
  idempotencyKey: String,
  receiptNo: { type: String, unique: true, sparse: true },
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },    // set for cash at desk
  paidAt: Date
}, { timestamps: true });

PaymentSchema.index({ member: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
```

### 2.8 `wishlists`

```js
const WishlistSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  book:   { type: Schema.Types.ObjectId, ref: 'Book', required: true },
  notifyWhenAvailable: { type: Boolean, default: true }
}, { timestamps: true });
WishlistSchema.index({ member: 1, book: 1 }, { unique: true });
```

### 2.9 `notifications`

```js
const NotificationSchema = new Schema({
  user:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:  { type: String, enum: ['due_soon', 'overdue', 'reservation_ready', 'fine_added', 'payment_success', 'account', 'general'] },
  title: String,
  message: String,
  link:  String,                                                // "#u-loans"
  channels: [{ type: String, enum: ['in_app', 'email', 'sms'] }],
  read:  { type: Boolean, default: false, index: true },
  sentAt: Date
}, { timestamps: true });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // auto-delete after 90 days
```

### 2.10 `settings` (single document)

```js
const SettingsSchema = new Schema({
  key: { type: String, default: 'library', unique: true },
  loanDays:         { student: { type: Number, default: 14 }, faculty: { type: Number, default: 30 }, public: { type: Number, default: 14 } },
  maxActiveLoans:   { student: { type: Number, default: 5 },  faculty: { type: Number, default: 10 }, public: { type: Number, default: 3 } },
  maxRenewals:      { type: Number, default: 2 },
  renewDays:        { type: Number, default: 7 },
  finePerDay:       { type: Number, default: 500 },              // paise → ₹5/day
  maxFinePerBook:   { type: Number, default: 50000 },
  suspendIfUnpaidAbove: { type: Number, default: 50000 },
  reservationHoldHours: { type: Number, default: 48 },
  dueReminderDaysBefore: { type: Number, default: 2 }
});
```

### 2.11 `auditLogs`, `counters`, `refreshTokens`

```js
const AuditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  action: String,                      // "book.create", "loan.issue", "fine.waive", "member.suspend"
  entity: String, entityId: Schema.Types.ObjectId,
  before: Schema.Types.Mixed, after: Schema.Types.Mixed,
  ip: String, userAgent: String
}, { timestamps: { createdAt: true, updatedAt: false } });

const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 1000 } });
// findOneAndUpdate({_id:'member'},{$inc:{seq:1}},{new:true,upsert:true}) → "M-" + seq

const RefreshTokenSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  tokenHash: String, userAgent: String, ip: String,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }   // TTL index
});
```

---

## 3. Key transactions (use MongoDB sessions)

### Issue a book (`POST /admin/loans/issue`)
Run inside `session.withTransaction()`:
1. Validate member: `status = active`, `stats.activeLoans < limit`, `stats.unpaidFines < suspendIfUnpaidAbove`.
2. Find a copy: `bookCopies.findOneAndUpdate({ barcode, status: 'available' }, { status: 'issued' })`.
3. Create `loans` document (snapshot fields + `dueAt = now + loanDays`).
4. `books`: `$inc availableCopies -1, borrowCount +1`.
5. `users`: `$inc stats.activeLoans +1, stats.totalBorrowed +1`.
6. If the member had a `ready` reservation for this book, mark it `fulfilled`.
7. Write `auditLogs`.

### Return a book (`POST /admin/loans/return`)
1. Loan → `status = returned`, `returnedAt = now`, `returnCondition`.
2. If `returnedAt > dueAt` (or damaged/lost) → create `fines` (amount computed from settings), link to the loan, `$inc users.stats.unpaidFines`.
3. Copy → `available` (or `damaged` / `lost`); book `$inc availableCopies +1` unless damaged/lost.
4. If reservations are `waiting` for this book: first in queue → `ready`, set `holdUntil`, create a notification, reserve the copy (`status: 'reserved'`).
5. `users`: `$inc stats.activeLoans -1`.

### Fine formula
```
daysLate = ceil((returnedAt - dueAt) / 1 day)
amount   = min(daysLate * finePerDay, maxFinePerBook)        // all in paise
```

---

## 4. Index summary

| Collection | Index | Why |
|---|---|---|
| users | `email` unique, `memberId` unique, text(name,email,memberId) | login, admin search |
| books | text(title,authors,tags,isbn), `{category, availableCopies}`, `borrowCount` | catalog search/filter, most borrowed |
| bookCopies | `barcode` unique, `{book,status}` | issue desk scan |
| loans | `{member,status}`, `{status,dueAt}`, partial unique on `copy` | My Loans, overdue cron |
| reservations | `{book,status,queuePosition}`, partial unique `{member,book}` | queue handling |
| fines | `{member,status}` | member + admin fines tab |
| notifications | `{user,read}`, TTL on `createdAt` | bell badge, auto-cleanup |

## 5. Scheduled jobs (node-cron / BullMQ)

| Job | Schedule | Action |
|---|---|---|
| `markOverdue` | daily 00:05 | loans with `dueAt < now` and `status = issued` → `overdue`; add/refresh fine |
| `dueReminders` | daily 08:00 | notify members whose loans are due in N days |
| `expireReservations` | hourly | `ready` reservations past `holdUntil` → `expired`, promote next in queue |
| `expireMemberships` | daily | `membershipExpiresAt < now` → `status = expired` |
| `recountStats` | weekly | recompute denormalised counters (safety net) |

## 6. Recommended folder structure

```
src/
  config/        db.js, env.js
  models/        user.js book.js bookCopy.js category.js loan.js reservation.js fine.js payment.js wishlist.js notification.js settings.js auditLog.js counter.js
  services/      loanService.js fineService.js reservationService.js paymentService.js notificationService.js
  controllers/   auth.js books.js loans.js reservations.js fines.js admin/*.js
  routes/        index.js (mounts /api/v1/*)
  middleware/    auth.js role.js validate.js errorHandler.js rateLimit.js
  jobs/          overdue.js reminders.js reservations.js
  utils/         pagination.js idGenerator.js money.js
```