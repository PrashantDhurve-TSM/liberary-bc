# LibraryHub API Sample Data

Base URL: `http://localhost:3000/api`

All request and response examples below are representative MongoDB/NestJS payloads for local testing. Replace IDs marked with `<...>` or `<24-character-mongo-id>` with real IDs.

Protected requests use:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

## 1. Root and authentication

### `GET /api`

No request body.

```json
"Hello World!"
```

### `POST /api/auth/register/member`

```json
{
  "name": "Aarav Patil",
  "email": "aarav.patil@example.com",
  "password": "StrongPass123",
  "phone": "9876543210",
  "membershipType": "student"
}
```

### `POST /api/auth/register`

Same request body and response shape as `POST /api/auth/register/member`.

### `POST /api/auth/register/librarian`

Requires an admin access token.

```json
{
  "name": "Sneha Joshi",
  "email": "sneha.librarian@example.com",
  "password": "Librarian123",
  "phone": "9123456780",
  "membershipType": "faculty"
}
```

### `POST /api/auth/admin/create/librarian`

Alias of `POST /api/auth/register/librarian`. Use the same request body.

### `POST /api/auth/admin/create`

Requires an admin access token.

```json
{
  "name": "Library Admin",
  "email": "library.admin@example.com",
  "password": "AdminPass123",
  "phone": "9988776655"
}
```

### `POST /api/auth`

```json
{
  "email": "aarav.patil@example.com",
  "password": "StrongPass123"
}
```

### `POST /api/auth/login`

```json
{
  "email": "aarav.patil@example.com",
  "password": "StrongPass123"
}
```

Representative response:

```json
{
  "accessToken": "<jwt-access-token>",
  "refreshToken": "<jwt-refresh-token>",
  "user": {
    "id": "6711a2b3c4d5e6f789012345",
    "memberId": "M-1001",
    "name": "Aarav Patil",
    "email": "aarav.patil@example.com",
    "role": "member",
    "status": "active"
  }
}
```

### `POST /api/auth/admin/login`

```json
{
  "email": "library.admin@example.com",
  "password": "AdminPass123"
}
```

Representative response:

```json
{
  "accessToken": "<jwt-access-token>",
  "refreshToken": "<jwt-refresh-token>",
  "user": {
    "id": "6711a2b3c4d5e6f789012346",
    "memberId": "A-0001",
    "name": "Library Admin",
    "email": "library.admin@example.com",
    "role": "admin",
    "status": "active"
  }
}
```

### `POST /api/auth/refresh`

```json
{
  "refreshToken": "<current-refresh-token>"
}
```

Representative response:

```json
{
  "accessToken": "<new-jwt-access-token>",
  "refreshToken": "<rotated-refresh-token>"
}
```

### `POST /api/auth/logout`

No request body.

```json
{
  "success": true,
  "message": "Logged out"
}
```

## 2. Signed-in profile

### `GET /api/me`

No request body.

```json
{
  "_id": "6711a2b3c4d5e6f789012345",
  "memberId": "M-1001",
  "name": "Aarav Patil",
  "email": "aarav.patil@example.com",
  "phone": "9876543210",
  "membershipType": "student",
  "role": "member",
  "status": "active"
}
```

### `PATCH /api/me`

```json
{
  "name": "Aarav S. Patil",
  "phone": "9876543211",
  "email": "aarav.s.patil@example.com"
}
```

### `POST /api/me/change-password`

```json
{
  "currentPassword": "StrongPass123",
  "newPassword": "NewStrongPass456"
}
```

## 3. Catalog

### `GET /api/books`

Example query:

```text
q=clean&category=6711a2b3c4d5e6f789012350&availability=available&year=2008&sort=-rating.avg&page=1&limit=20
```

Representative response:

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012360",
      "bookId": "B-0001",
      "title": "Clean Code",
      "authors": ["Robert C. Martin"],
      "isbn": "9780132350884",
      "publishedYear": 2008,
      "coverUrl": "/covers/clean-code.jpg",
      "availableCopies": 3,
      "availability": "available"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/books/new-arrivals`

Example query: `limit=8`

```json
[
  {
    "id": "6711a2b3c4d5e6f789012361",
    "bookId": "B-0002",
    "title": "Design Patterns",
    "authors": ["Erich Gamma", "Richard Helm"],
    "coverUrl": "/covers/design-patterns.jpg",
    "availableCopies": 2
  }
]
```

### `GET /api/books/:id`

Example: `GET /api/books/6711a2b3c4d5e6f789012360`

```json
{
  "id": "6711a2b3c4d5e6f789012360",
  "bookId": "B-0001",
  "title": "Clean Code",
  "authors": ["        replication:
    replSetName: rs0"],
  "isbn": "9780132350884",
  "category": "6711a2b3c4d5e6f789012350",
  "publishedYear": 2008,
  "publisher": "Prentice Hall",
  "language": "English",
  "pages": 464,
  "description": "A handbook of agile software craftsmanship.",
  "coverUrl": "/covers/clean-code.jpg",
  "shelfLocation": "A-12",
  "tags": ["software", "craftsmanship"],
  "totalCopies": 5,
  "availableCopies": 3,
  "rating": {
    "avg": 4.7,
    "count": 42
  },
  "me": {
    "canBorrow": true,
    "canReserve": false,
    "alreadyBorrowed": false,
    "reservation": null
  }
}
```

### `GET /api/categories`

```json
[
  {
    "id": "6711a2b3c4d5e6f789012350",
    "name": "Computer Science",
    "description": "Programming, data structures and computing"
  },
  {
    "id": "6711a2b3c4d5e6f789012351",
    "name": "Self Help",
    "description": "Personal growth and productivity"
  }
]
```

## 4. Member circulation

### `GET /api/me/loans`

Example query: `status=active`

```json
[
  {
    "id": "6711a2b3c4d5e6f789012370",
    "barcode": "B-0001-2",
    "status": "issued",
    "snapshot": {
      "title": "Clean Code",
      "authors": ["Robert C. Martin"]
    },
    "issuedAt": "2026-11-10T09:30:00.000Z",
    "dueAt": "2026-11-24T09:30:00.000Z",
    "renewCount": 0
  }
]
```

### `GET /api/me/reservations`

```json
[
  {
    "id": "6711a2b3c4d5e6f789012380",
    "bookId": "6711a2b3c4d5e6f789012361",
    "status": "waiting",
    "queuePosition": 2,
    "reservedAt": "2026-11-20T08:15:00.000Z"
  }
]
```

### `POST /api/books/:id/borrow`

Example: `POST /api/books/6711a2b3c4d5e6f789012360/borrow`

No request body.

```json
{
  "loanId": "6711a2b3c4d5e6f789012371",
  "title": "Clean Code",
  "status": "issued",
  "issuedAt": "2026-11-21T11:23:00.000Z",
  "dueAt": "2026-12-05T11:23:00.000Z"
}
```

### `POST /api/books/:id/reserve`

Example: `POST /api/books/6711a2b3c4d5e6f789012361/reserve`

No request body.

```json
{
  "reservationId": "6711a2b3c4d5e6f789012380",
  "queuePosition": 2,
  "status": "waiting"
}
```

### `DELETE /api/reservations/:id`

Example: `DELETE /api/reservations/6711a2b3c4d5e6f789012380`

No request body.

```json
{
  "success": true,
  "message": "Reservation cancelled"
}
```

### `POST /api/loans/:id/renew`

Example: `POST /api/loans/6711a2b3c4d5e6f789012370/renew`

No request body.

```json
{
  "loanId": "6711a2b3c4d5e6f789012370",
  "oldDueAt": "2026-11-24T09:30:00.000Z",
  "newDueAt": "2026-12-01T09:30:00.000Z",
  "renewCount": 1,
  "renewalsLeft": 1
}
```

### `POST /api/loans/:id/return-request`

Example: `POST /api/loans/6711a2b3c4d5e6f789012370/return-request`

No request body.

```json
{
  "success": true,
  "message": "Return request submitted",
  "loanId": "6711a2b3c4d5e6f789012370"
}
```

## 5. Member fines and payments

### `GET /api/me/fines`

```json
{
  "totalDue": 4000,
  "items": [
    {
      "id": "6711a2b3c4d5e6f789012390",
      "snapshot": {
        "title": "Atomic Habits"
      },
      "daysLate": 8,
      "amount": 4000,
      "paidAmount": 0,
      "status": "unpaid",
      "reason": "overdue"
    }
  ]
}
```

### `POST /api/payments/demo`

```json
{
  "fineIds": [
    "6711a2b3c4d5e6f789012390"
  ]
}
```

Headers:

```http
Idempotency-Key: demo-payment-20261121-001
```

Representative response:

```json
{
  "id": "6711a2b3c4d5e6f789012391",
  "receiptNumber": "RCP-20261121-0001",
  "amount": 4000,
  "status": "paid",
  "provider": "demo"
}
```

### `GET /api/me/payments`

```json
[
  {
    "id": "6711a2b3c4d5e6f789012391",
    "receiptNumber": "RCP-20261121-0001",
    "amount": 4000,
    "status": "paid",
    "provider": "demo",
    "paidAt": "2026-11-21T11:30:00.000Z"
  }
]
```

### `GET /api/payments/:id/receipt`

Example: `GET /api/payments/6711a2b3c4d5e6f789012391/receipt`

No request body. Returns a PDF file:

```text
Content-Type: application/pdf
Content-Disposition: attachment; filename="receipt-RCP-20261121-0001.pdf"
```

## 6. Admin and librarian users

### `GET /api/user`

Example query: `?page=1&limit=20`

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012345",
      "memberId": "M-1001",
      "name": "Aarav Patil",
      "email": "aarav.patil@example.com",
      "phone": "9876543210",
      "membershipType": "student",
      "role": "member",
      "status": "active"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `POST /api/user/create/member`

```json
{
  "name": "Neha Sharma",
  "email": "neha.sharma@example.com",
  "password": "MemberPass123",
  "phone": "9876501234",
  "membershipType": "public"
}
```

### `POST /api/user`

```json
{
  "name": "Rohan Mehta",
  "email": "rohan.mehta@example.com",
  "password": "RoleUser123",
  "phone": "9876512345",
  "membershipType": "faculty",
  "role": "librarian",
  "status": "active"
}
```

Allowed `role` values: `member`, `librarian`, `admin`.

Allowed `status` values: `active`, `suspended`, `expired`, `pending`.

### `GET /api/user/:id`

Example: `GET /api/user/6711a2b3c4d5e6f789012345`

```json
{
  "id": "6711a2b3c4d5e6f789012345",
  "memberId": "M-1001",
  "name": "Aarav Patil",
  "email": "aarav.patil@example.com",
  "phone": "9876543210",
  "membershipType": "student",
  "role": "member",
  "status": "active"
}
```

### `PATCH /api/user/:id`

Example: `PATCH /api/user/6711a2b3c4d5e6f789012345`

```json
{
  "name": "Aarav Patil",
  "email": "aarav.patil@example.com",
  "phone": "9876543219",
  "status": "suspended"
}
```

### `DELETE /api/user/:id`

Example: `DELETE /api/user/6711a2b3c4d5e6f789012345`

No request body.

```json
{
  "success": true,
  "message": "User deleted"
}
```

## 7. Admin catalog

### `GET /api/admin/books`

Example query:

```text
q=clean&category=6711a2b3c4d5e6f789012350&availability=available&status=active&sort=-createdAt&page=1&limit=20
```

Representative response:

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012360",
      "bookId": "B-0001",
      "title": "Clean Code",
      "totalCopies": 5,
      "availableCopies": 3,
      "status": "active"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `POST /api/admin/books`

```json
{
  "title": "Refactoring",
  "authors": ["Martin Fowler"],
  "isbn": "9780134757599",
  "category": "6711a2b3c4d5e6f789012350",
  "totalCopies": 3,
  "publishedYear": 2018,
  "publisher": "Pearson",
  "language": "English",
  "pages": 448,
  "description": "Improving the design of existing code.",
  "coverUrl": "/covers/refactoring.jpg",
  "tags": ["refactoring", "software"],
  "shelfLocation": "B-3"
}
```

Representative response:

```json
{
  "id": "6711a2b3c4d5e6f789012362",
  "bookId": "B-0003",
  "title": "Refactoring",
  "totalCopies": 3,
  "copies": [
    "B-0003-1",
    "B-0003-2",
    "B-0003-3"
  ]
}
```

### `GET /api/admin/books/:id`

Example: `GET /api/admin/books/6711a2b3c4d5e6f789012360`

```json
{
  "id": "6711a2b3c4d5e6f789012360",
  "bookId": "B-0001",
  "title": "Clean Code",
  "authors": ["Robert C. Martin"],
  "category": "6711a2b3c4d5e6f789012350",
  "totalCopies": 5,
  "availableCopies": 3,
  "status": "active",
  "copies": [
    {
      "id": "6711a2b3c4d5e6f789012365",
      "barcode": "B-0001-1",
      "status": "available"
    },
    {
      "id": "6711a2b3c4d5e6f789012366",
      "barcode": "B-0001-2",
      "status": "issued"
    }
  ]
}
```

### `PATCH /api/admin/books/:id`

Example: `PATCH /api/admin/books/6711a2b3c4d5e6f789012360`

```json
{
  "title": "Clean Code",
  "authors": ["Robert C. Martin"],
  "isbn": "9780132350884",
  "category": "6711a2b3c4d5e6f789012350",
  "publishedYear": 2008,
  "publisher": "Prentice Hall",
  "language": "English",
  "pages": 464,
  "description": "A handbook of agile software craftsmanship.",
  "coverUrl": "/covers/clean-code-v2.jpg",
  "tags": ["software", "craftsmanship", "agile"],
  "shelfLocation": "A-14"
}
```

### `POST /api/admin/books/:id/copies`

Example: `POST /api/admin/books/6711a2b3c4d5e6f789012360/copies`

```json
{
  "count": 2
}
```

Representative response:

```json
{
  "totalCopies": 7,
  "copies": [
    "B-0001-6",
    "B-0001-7"
  ]
}
```

### `PATCH /api/admin/copies/:copyId`

Example: `PATCH /api/admin/copies/6711a2b3c4d5e6f789012366`

```json
{
  "status": "damaged"
}
```

Allowed values: `available`, `damaged`, `lost`, `withdrawn`.

### `DELETE /api/admin/books/:id`

Example: `DELETE /api/admin/books/6711a2b3c4d5e6f789012360`

No request body.

```json
{
  "success": true,
  "message": "Book archived"
}
```

### `POST /api/admin/categories`

```json
{
  "name": "Science Fiction",
  "description": "Speculative fiction and futuristic stories"
}
```

### `PATCH /api/admin/categories/:id`

Example: `PATCH /api/admin/categories/6711a2b3c4d5e6f789012350`

```json
{
  "name": "Computer Science",
  "description": "Programming, algorithms and computing"
}
```

### `DELETE /api/admin/categories/:id`

Example: `DELETE /api/admin/categories/6711a2b3c4d5e6f789012351`

No request body.

```json
{
  "success": true,
  "message": "Category deleted"
}
```

## 8. Admin circulation

### `GET /api/admin/lookup/member?q=M-1001`

No request body.

```json
{
  "id": "6711a2b3c4d5e6f789012345",
  "memberId": "M-1001",
  "name": "Aarav Patil",
  "membershipType": "student",
  "status": "active",
  "activeLoans": 2,
  "unpaidFines": 4000,
  "canBorrow": false
}
```

### `GET /api/admin/lookup/members?q=Aarav`

Searches member name, member ID, and email. Results are limited to 10 suggestions.

```json
[
  {
    "id": "6711a2b3c4d5e6f789012345",
    "memberId": "M-1001",
    "name": "Aarav Patil",
    "email": "aarav@example.com",
    "membershipType": "student",
    "status": "active"
  }
]
```

### `GET /api/admin/lookup/books?q=Clean&copyStatus=available`

Searches active book titles, book IDs, or ISBNs. `copyStatus` can be `available` for issuing or `issued` for returning; it defaults to `available`.

```json
[
  {
    "id": "6711a2b3c4d5e6f789012360",
    "bookId": "B-0001",
    "title": "Clean Code",
    "isbn": "9780132350884",
    "availableCopies": 3,
    "totalCopies": 5,
    "copies": [
      {
        "barcode": "B-0001-1",
        "status": "available",
        "currentLoan": null
      }
    ]
  }
]
```

For `copyStatus=issued`, each copy includes its current borrower and due date:

```json
[
  {
    "id": "6711a2b3c4d5e6f789012360",
    "bookId": "B-0001",
    "title": "Clean Code",
    "isbn": "9780132350884",
    "availableCopies": 3,
    "totalCopies": 5,
    "copies": [
      {
        "barcode": "B-0001-2",
        "status": "issued",
        "currentLoan": {
          "memberName": "Aarav Patil",
          "memberId": "M-1001",
          "dueAt": "2026-11-24T09:30:00.000Z"
        }
      }
    ]
  }
]
```

### `GET /api/admin/lookup/copy?barcode=B-0001-2`

No request body.

```json
{
  "barcode": "B-0001-2",
  "status": "issued",
  "book": {
    "id": "6711a2b3c4d5e6f789012360",
    "bookId": "B-0001",
    "title": "Clean Code"
  },
  "loan": {
    "id": "6711a2b3c4d5e6f789012370",
    "memberId": "M-1001",
    "status": "issued",
    "dueAt": "2026-11-24T09:30:00.000Z"
  }
}
```

### `POST /api/admin/loans/issue`

```json
{
  "memberId": "M-1001",
  "barcode": "B-0001-2",
  "dueAt": "2026-12-01T09:30:00.000Z"
}
```

Representative response:

```json
{
  "loanId": "6711a2b3c4d5e6f789012372",
  "member": "Aarav Patil",
  "title": "Clean Code",
  "barcode": "B-0001-2",
  "issuedAt": "2026-11-21T11:45:00.000Z",
  "dueAt": "2026-12-01T09:30:00.000Z"
}
```

### `POST /api/admin/loans/return`

```json
{
  "barcode": "B-0001-2",
  "condition": "good"
}
```

`condition` values: `good`, `damaged`, `lost`.

Representative response:

```json
{
  "loanId": "6711a2b3c4d5e6f789012372",
  "returnedAt": "2026-11-21T12:00:00.000Z",
  "fine": {
    "id": "6711a2b3c4d5e6f789012392",
    "daysLate": 3,
    "amount": 2100
  },
  "nextReservation": null
}
```

### `POST /api/admin/loans/:id/renew`

Example: `POST /api/admin/loans/6711a2b3c4d5e6f789012370/renew`

No request body.

```json
{
  "loanId": "6711a2b3c4d5e6f789012370",
  "newDueAt": "2026-12-01T09:30:00.000Z",
  "renewCount": 1
}
```

### `POST /api/admin/loans/:id/mark-lost`

Example: `POST /api/admin/loans/6711a2b3c4d5e6f789012370/mark-lost`

No request body.

```json
{
  "loanId": "6711a2b3c4d5e6f789012370",
  "status": "lost",
  "fine": {
    "id": "6711a2b3c4d5e6f789012393",
    "amount": 250000,
    "reason": "lost"
  }
}
```

### `GET /api/admin/loans`

Example query:

```text
status=issued&member=M-1001&from=2026-11-01&to=2026-11-30&page=1&limit=20
```

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012370",
      "memberId": "M-1001",
      "memberName": "Aarav Patil",
      "barcode": "B-0001-2",
      "title": "Clean Code",
      "status": "issued",
      "issuedAt": "2026-11-10T09:30:00.000Z",
      "dueAt": "2026-11-24T09:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/admin/loans/overdue`

Example query: `status=overdue&page=1&limit=20`

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012373",
      "memberId": "M-1001",
      "memberName": "Aarav Patil",
      "title": "Atomic Habits",
      "barcode": "B-0007-1",
      "dueAt": "2026-11-13T09:30:00.000Z",
      "daysLate": 8,
      "status": "overdue"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/admin/reservations`

Example query: `status=waiting&book=6711a2b3c4d5e6f789012361`

```json
[
  {
    "id": "6711a2b3c4d5e6f789012380",
    "memberId": "6711a2b3c4d5e6f789012345",
    "memberName": "Aarav Patil",
    "bookId": "6711a2b3c4d5e6f789012361",
    "title": "Design Patterns",
    "status": "waiting",
    "queuePosition": 2,
    "reservedAt": "2026-11-20T08:15:00.000Z"
  }
]
```

### `POST /api/admin/reservations/:id/notify`

Example: `POST /api/admin/reservations/6711a2b3c4d5e6f789012380/notify`

No request body.

```json
{
  "success": true,
  "reservationId": "6711a2b3c4d5e6f789012380",
  "status": "ready",
  "holdUntil": "2026-11-24T12:00:00.000Z"
}
```

### `DELETE /api/admin/reservations/:id`

Example: `DELETE /api/admin/reservations/6711a2b3c4d5e6f789012380`

No request body.

```json
{
  "success": true,
  "message": "Reservation cancelled"
}
```

## 9. Fines and payments

### `GET /api/admin/fines`

Example query: `status=unpaid&member=M-1001&from=2026-11-01&to=2026-11-30&page=1&limit=20`

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012390",
      "memberId": "M-1001",
      "memberName": "Aarav Patil",
      "title": "Atomic Habits",
      "reason": "overdue",
      "amount": 4000,
      "paidAmount": 0,
      "status": "unpaid",
      "createdAt": "2026-11-21T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `POST /api/admin/fines`

```json
{
  "memberId": "M-1001",
  "amount": 1000,
  "reason": "manual",
  "description": "Replacement charge for lost library card"
}
```

### `POST /api/admin/fines/:id/pay`

Example: `POST /api/admin/fines/6711a2b3c4d5e6f789012390/pay`

```json
{
  "method": "cash"
}
```

Representative response:

```json
{
  "paymentId": "6711a2b3c4d5e6f789012394",
  "fineId": "6711a2b3c4d5e6f789012390",
  "amount": 4000,
  "method": "cash",
  "status": "paid"
}
```

### `POST /api/admin/fines/:id/waive`

Example: `POST /api/admin/fines/6711a2b3c4d5e6f789012390/waive`

```json
{
  "reason": "First offence and valid medical leave"
}
```

Representative response:

```json
{
  "fineId": "6711a2b3c4d5e6f789012390",
  "status": "waived",
  "reason": "First offence and valid medical leave"
}
```

### `GET /api/admin/payments`

Example query: `status=paid&member=M-1001&from=2026-11-01&to=2026-11-30&page=1&limit=20`

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012394",
      "memberId": "M-1001",
      "memberName": "Aarav Patil",
      "amount": 4000,
      "method": "cash",
      "status": "paid",
      "paidAt": "2026-11-21T12:10:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## 10. Dashboards and reports

### `GET /api/admin/dashboard`

```json
{
  "stats": {
    "totalBooks": 10240,
    "members": 1862,
    "issuedToday": 34,
    "overdue": 27
  },
  "circulation": [
    {
      "date": "2026-11-21",
      "label": "Sat",
      "issued": 34,
      "returned": 21
    }
  ],
  "overdueLoans": [
    {
      "id": "6711a2b3c4d5e6f789012373",
      "snapshot": {
        "memberName": "Aarav Patil",
        "title": "Atomic Habits"
      },
      "daysLate": 8
    }
  ],
  "recentActivity": [
    {
      "member": "Aarav Patil",
      "book": "Clean Code",
      "action": "Issued",
      "at": "2026-11-21T11:45:00.000Z"
    }
  ]
}
```

### `GET /api/me/dashboard`

```json
{
  "stats": {
    "borrowed": 3,
    "dueThisWeek": 1,
    "reservations": 1,
    "overdue": 1,
    "pendingFines": 4000
  },
  "currentLoans": [
    {
      "id": "6711a2b3c4d5e6f789012373",
      "snapshot": {
        "title": "Atomic Habits",
        "authors": ["James Clear"]
      },
      "dueAt": "2026-11-13T09:30:00.000Z",
      "status": "overdue"
    }
  ],
  "newArrivals": [
    {
      "id": "6711a2b3c4d5e6f789012361",
      "title": "Design Patterns",
      "authors": ["Erich Gamma", "Richard Helm"]
    }
  ]
}
```

### `GET /api/admin/reports/circulation`

Example query: `range=week`

```json
{
  "range": "week",
  "data": [
    {
      "date": "2026-11-21",
      "label": "Sat",
      "issued": 34,
      "returned": 21
    }
  ]
}
```

### `GET /api/admin/reports/most-borrowed`

Example query: `limit=10`

```json
[
  {
    "bookId": "6711a2b3c4d5e6f789012360",
    "title": "Clean Code",
    "borrowCount": 128
  },
  {
    "bookId": "6711a2b3c4d5e6f789012363",
    "title": "Atomic Habits",
    "borrowCount": 94
  }
]
```

### `GET /api/admin/reports/overdue`

```json
{
  "total": 27,
  "items": [
    {
      "loanId": "6711a2b3c4d5e6f789012373",
      "memberId": "M-1001",
      "memberName": "Aarav Patil",
      "title": "Atomic Habits",
      "dueAt": "2026-11-13T09:30:00.000Z",
      "daysLate": 8
    }
  ]
}
```

### `GET /api/admin/reports/fines`

Example query: `from=2026-11-01&to=2026-11-30`

```json
{
  "pending": 400000,
  "cashCollected": 125000,
  "demoRecorded": 4000,
  "waived": 25000
}
```

All report values are integer paise.

### `GET /api/admin/reports/members`

```json
[
  {
    "month": "2026-11",
    "student": 42,
    "faculty": 18,
    "public": 12
  }
]
```

### `GET /api/admin/reports/categories`

```json
[
  {
    "categoryId": "6711a2b3c4d5e6f789012350",
    "category": "Computer Science",
    "activeTitles": 184
  },
  {
    "categoryId": "6711a2b3c4d5e6f789012351",
    "category": "Self Help",
    "activeTitles": 96
  }
]
```

### `GET /api/admin/reports/export`

Example query:

```text
type=circulation&format=csv&range=week
```

Returns CSV:

```csv
date,label,issued,returned
2026-11-21,Sat,34,21
2026-11-22,Sun,28,26
```

## 11. Library settings

### `GET /api/admin/settings`

```json
{
  "id": "6711a2b3c4d5e6f789012395",
  "selfCheckout": true,
  "loanDays": {
    "student": 21,
    "faculty": 30,
    "public": 14
  },
  "maxActiveLoans": {
    "student": 5,
    "faculty": 10,
    "public": 3
  },
  "maxRenewals": 2,
  "renewDays": 7,
  "finePerDay": 500,
  "maxFinePerBook": 50000,
  "unpaidFineBorrowLimit": 100000,
  "reservationHoldHours": 48,
  "damagedCharge": 50000,
  "lostCharge": 250000
}
```

### `PATCH /api/admin/settings`

```json
{
  "selfCheckout": true,
  "loanDays": {
    "student": 21,
    "faculty": 30,
    "public": 14
  },
  "maxActiveLoans": {
    "student": 5,
    "faculty": 10,
    "public": 3
  },
  "maxRenewals": 2,
  "renewDays": 7,
  "finePerDay": 500,
  "maxFinePerBook": 50000,
  "unpaidFineBorrowLimit": 100000,
  "reservationHoldHours": 48,
  "damagedCharge": 50000,
  "lostCharge": 250000
}
```

## 12. Audit logs

### `GET /api/admin/audit-logs`

Example query:

```text
actor=6711a2b3c4d5e6f789012346&resource=loans&from=2026-11-01&to=2026-11-30&page=1&limit=20
```

```json
{
  "data": [
    {
      "id": "6711a2b3c4d5e6f789012396",
      "actor": {
        "id": "6711a2b3c4d5e6f789012346",
        "name": "Library Admin",
        "role": "admin"
      },
      "method": "POST",
      "route": "/api/admin/loans/issue",
      "resource": "loan",
      "resourceId": "6711a2b3c4d5e6f789012372",
      "createdAt": "2026-11-21T11:45:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

mongosh "mongodb://127.0.0.1:27017/admin" --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
