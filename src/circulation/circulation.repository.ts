import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { Role } from '../enums/role.enum.js';
import { Book } from '../catalog/entities/book.entity.js';
import {
  BookCopy,
  BookCopyStatus,
  type BookCopyDocument,
} from '../catalog/entities/book-copy.entity.js';
import { User, type UserDocument } from '../user/entities/user.entity.js';
import type { CirculationPolicy } from './circulation.policy.js';
import { AdminLoansQueryDto, AdminReservationsQueryDto } from './dto/circulation.dto.js';
import { Fine, FineStatus } from './entities/fine.entity.js';
import { Loan, LoanStatus, type LoanDocument } from './entities/loan.entity.js';
import { Notification } from './entities/notification.entity.js';
import {
  Reservation,
  ReservationStatus,
  type ReservationDocument,
} from './entities/reservation.entity.js';

const activeLoanStatuses = [
  LoanStatus.PENDING,
  LoanStatus.ISSUED,
  LoanStatus.OVERDUE,
];

const loanStatusByQuery = {
  pending: LoanStatus.PENDING,
  issued: LoanStatus.ISSUED,
  overdue: LoanStatus.OVERDUE,
  returned: LoanStatus.RETURNED,
  lost: LoanStatus.LOST,
};

const reservationStatusByQuery = {
  waiting: ReservationStatus.WAITING,
  ready: ReservationStatus.READY,
  fulfilled: ReservationStatus.FULFILLED,
  cancelled: ReservationStatus.CANCELLED,
  expired: ReservationStatus.EXPIRED,
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class CirculationRepository {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @InjectModel(BookCopy.name) private readonly copyModel: Model<BookCopy>,
    @InjectModel(Loan.name) private readonly loanModel: Model<Loan>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<Reservation>,
    @InjectModel(Fine.name) private readonly fineModel: Model<Fine>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  // Local MongoDB commonly runs as a standalone server and does not support
  // transaction numbers. Keep circulation operations compatible with that
  // setup instead of requiring replica-set configuration.
  private runWithoutTransaction<T>(
    work: (session: ClientSession | undefined) => Promise<T>,
  ): Promise<T> {
    return work(undefined);
  }

  requestBorrow(
    memberId: string,
    bookId: string,
    selfCheckout: boolean,
    policy: CirculationPolicy,
  ) {
    return this.runWithoutTransaction(async (session) => {
      const member = await this.requireActiveMember(memberId, session);
      const book = await this.requireActiveBook(bookId, session);
      await this.assertNoExistingLoan(member._id, book._id, session);
      const activeReservation = await this.reservationModel
        .exists({
          member: member._id,
          book: book._id,
          status: { $in: [ReservationStatus.WAITING, ReservationStatus.READY] },
        })
        .session(session ?? null);
      if (activeReservation) {
        throw new ConflictException(
          'Member already has a reservation for this title',
        );
      }
      await this.assertBorrowingAllowed(member, session, policy);

      if (book.availableCopies < 1) {
        throw new UnprocessableEntityException('No copies are available');
      }

      const now = new Date();
      const status = selfCheckout ? LoanStatus.ISSUED : LoanStatus.PENDING;
      const copy = await this.copyModel
        .findOneAndUpdate(
          { book: book._id, status: BookCopyStatus.AVAILABLE },
          {
            $set: {
              status: selfCheckout
                ? BookCopyStatus.ISSUED
                : BookCopyStatus.RESERVED,
            },
          },
          { new: true, session, sort: { barcode: 1 } },
        )
        .exec();
      if (!copy) {
        throw new UnprocessableEntityException('No copies are available');
      }

      const issuedAt = selfCheckout ? now : null;
      const dueAt = selfCheckout
        ? this.dueDate(member.membershipType, now, policy)
        : null;
      const [loan] = await this.loanModel.create(
        [
          {
            member: member._id,
            book: book._id,
            copy: copy._id,
            snapshot: {
              memberName: member.name,
              memberId: member.memberId,
              title: book.title,
              authors: book.authors,
              barcode: copy.barcode,
            },
            issuedAt,
            dueAt,
            maxRenewals: policy.maxRenewals,
            status,
          },
        ],
        { session },
      );

      const loanLinkUpdate = await this.copyModel
        .updateOne(
          { _id: copy._id },
          { $set: { currentLoan: loan._id } },
          { session },
        )
        .exec();
      if (loanLinkUpdate.modifiedCount !== 1) {
        throw new ConflictException('Book copy status changed');
      }
      const stockUpdate = await this.bookModel
        .updateOne(
          { _id: book._id, availableCopies: { $gt: 0 } },
          {
            $inc: {
              availableCopies: -1,
              ...(selfCheckout ? { borrowCount: 1 } : {}),
            },
          },
          { session },
        )
        .exec();
      if (stockUpdate.modifiedCount !== 1) {
        throw new ConflictException('Book availability changed');
      }
      if (selfCheckout) {
        await this.userModel
          .updateOne(
            { _id: member._id },
            { $inc: { 'stats.activeLoans': 1, 'stats.totalBorrowed': 1 } },
            { session },
          )
          .exec();
      }

      return {
        loanId: loan._id.toString(),
        title: book.title,
        status,
        issuedAt,
        dueAt,
      };
    });
  }

  reserveBook(memberId: string, bookId: string) {
    return this.runWithoutTransaction(async (session) => {
      const member = await this.requireActiveMember(memberId, session);
      const book = await this.requireActiveBook(bookId, session);
      await this.assertNoExistingLoan(member._id, book._id, session);
      const existingReservation = await this.reservationModel
        .exists({
          member: member._id,
          book: book._id,
          status: { $in: [ReservationStatus.WAITING, ReservationStatus.READY] },
        })
        .session(session ?? null);
      if (existingReservation) {
        throw new ConflictException('Member already has a reservation for this title');
      }
      if (book.availableCopies > 0) {
        throw new UnprocessableEntityException(
          'A copy is available; borrow it instead',
        );
      }

      const updatedBook = await this.bookModel
        .findOneAndUpdate(
          { _id: book._id, status: 'active', availableCopies: 0 },
          { $inc: { reservationCount: 1 } },
          { new: true, session },
        )
        .exec();
      if (!updatedBook) {
        throw new UnprocessableEntityException(
          'A copy is available; borrow it instead',
        );
      }

      const waitingCount = await this.reservationModel
        .countDocuments({
          book: book._id,
          status: ReservationStatus.WAITING,
        })
        .session(session ?? null)
        .exec();
      const [reservation] = await this.reservationModel.create(
        [
          {
            member: member._id,
            book: book._id,
            snapshot: { memberName: member.name, title: book.title },
            queuePosition: waitingCount + 1,
            status: ReservationStatus.WAITING,
          },
        ],
        { session },
      );
      return {
        reservationId: reservation._id.toString(),
        queuePosition: reservation.queuePosition,
        status: reservation.status,
      };
    });
  }

  issueAtDesk(
    memberId: string,
    barcode: string,
    actorId: string,
    requestedDueAt: Date | undefined,
    policy: CirculationPolicy,
  ) {
    return this.runWithoutTransaction(async (session) => {
      const member = await this.userModel
        .findOne({ memberId })
        .session(session ?? null)
        .exec();
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      this.assertActiveMember(member);

      const copy = await this.copyModel
        .findOne({ barcode })
        .session(session ?? null)
        .exec();
      if (!copy) {
        throw new NotFoundException('Book copy not found');
      }
      const book = await this.requireActiveBook(copy.book.toString(), session);
      const pendingLoan = await this.loanModel
        .findOne({
          member: member._id,
          copy: copy._id,
          status: LoanStatus.PENDING,
        })
        .session(session ?? null)
        .exec();
      const readyReservation = await this.reservationModel
        .findOne({
          book: book._id,
          copy: copy._id,
          status: ReservationStatus.READY,
        })
        .session(session ?? null)
        .exec();

      if (readyReservation && !readyReservation.member.equals(member._id)) {
        throw new ConflictException(
          'This copy is held for another member',
        );
      }
      await this.assertFineLimit(member, session, policy);
      if (pendingLoan) {
        const activeLoans = await this.loanModel
          .countDocuments({
            member: member._id,
            status: { $in: [LoanStatus.ISSUED, LoanStatus.OVERDUE] },
          })
          .session(session ?? null)
          .exec();
        if (activeLoans >= this.maxActiveLoans(member.membershipType, policy)) {
          throw new UnprocessableEntityException('Loan limit reached');
        }
      } else {
        await this.assertBorrowingAllowed(member, session, policy);
      }

      const alreadyBorrowed = await this.loanModel
        .exists({
          member: member._id,
          book: book._id,
          status: {
            $in: pendingLoan
              ? [LoanStatus.ISSUED, LoanStatus.OVERDUE]
              : activeLoanStatuses,
          },
        })
        .session(session ?? null);
      if (alreadyBorrowed) {
        throw new ConflictException('Member already has this title');
      }

      if (
        pendingLoan
          ? copy.status !== BookCopyStatus.RESERVED
          : copy.status !== BookCopyStatus.AVAILABLE &&
            !(copy.status === BookCopyStatus.RESERVED && readyReservation)
      ) {
        throw new UnprocessableEntityException('Book copy is not available');
      }

      if (!pendingLoan && copy.status === BookCopyStatus.AVAILABLE) {
        const claimed = await this.copyModel
          .findOneAndUpdate(
            { _id: copy._id, status: BookCopyStatus.AVAILABLE },
            { $set: { status: BookCopyStatus.ISSUED } },
            { new: true, session },
          )
          .exec();
        if (!claimed) {
          throw new UnprocessableEntityException('Book copy is not available');
        }
      } else {
        const claimed = await this.copyModel
          .updateOne(
            { _id: copy._id, status: BookCopyStatus.RESERVED },
            { $set: { status: BookCopyStatus.ISSUED } },
            { session },
          )
          .exec();
        if (claimed.modifiedCount !== 1) {
          throw new ConflictException('Book copy is no longer reserved');
        }
      }

      const issuedAt = new Date();
      const dueAt = this.validDueDate(
        requestedDueAt,
        member.membershipType,
        issuedAt,
        policy,
      );
      let loan: LoanDocument;
      if (pendingLoan) {
        const updatedLoan = await this.loanModel
          .findOneAndUpdate(
            { _id: pendingLoan._id, status: LoanStatus.PENDING },
            {
              $set: {
                status: LoanStatus.ISSUED,
                issuedAt,
                dueAt,
                issuedBy: new Types.ObjectId(actorId),
              },
            },
            { new: true, session },
          )
          .exec();
        if (!updatedLoan) {
          throw new ConflictException('Borrow request is no longer pending');
        }
        loan = updatedLoan;
      } else {
        const [createdLoan] = await this.loanModel.create(
          [
            {
              member: member._id,
              book: book._id,
              copy: copy._id,
              snapshot: {
                memberName: member.name,
                memberId: member.memberId,
                title: book.title,
                authors: book.authors,
                barcode: copy.barcode,
              },
              issuedAt,
              dueAt,
              maxRenewals: policy.maxRenewals,
              status: LoanStatus.ISSUED,
              issuedBy: new Types.ObjectId(actorId),
            },
          ],
          { session },
        );
        loan = createdLoan;
        const stockUpdate = await this.bookModel
          .updateOne(
            { _id: book._id, availableCopies: { $gt: 0 } },
            { $inc: { availableCopies: -1 } },
            { session },
          )
          .exec();
        if (stockUpdate.modifiedCount !== 1) {
          throw new ConflictException('Book availability changed');
        }
      }

      await this.copyModel
        .updateOne(
          { _id: copy._id },
          { $set: { status: BookCopyStatus.ISSUED, currentLoan: loan._id } },
          { session },
        )
        .exec();
      await this.bookModel
        .updateOne({ _id: book._id }, { $inc: { borrowCount: 1 } }, { session })
        .exec();
      await this.userModel
        .updateOne(
          { _id: member._id },
          { $inc: { 'stats.activeLoans': 1, 'stats.totalBorrowed': 1 } },
          { session },
        )
        .exec();
      if (readyReservation) {
        const fulfilled = await this.reservationModel
          .updateOne(
            { _id: readyReservation._id, status: ReservationStatus.READY },
            {
              $set: {
                status: ReservationStatus.FULFILLED,
                fulfilledLoan: loan._id,
              },
              $unset: { copy: 1, holdUntil: 1 },
            },
            { session },
          )
          .exec();
        if (fulfilled.modifiedCount !== 1) {
          throw new ConflictException('Reservation is no longer ready');
        }
        const reservationCountUpdate = await this.bookModel
          .updateOne(
            { _id: book._id, reservationCount: { $gt: 0 } },
            { $inc: { reservationCount: -1 } },
            { session },
          )
          .exec();
        if (reservationCountUpdate.modifiedCount !== 1) {
          throw new ConflictException('Reservation count is inconsistent');
        }
        await this.renumberWaiting(session, book._id);
      }

      return {
        loanId: loan._id.toString(),
        member: member.name,
        title: book.title,
        issuedAt,
        dueAt,
      };
    });
  }

  returnByBarcode(
    barcode: string,
    condition: 'good' | 'damaged' | 'lost',
    actorId: string,
    policy: CirculationPolicy,
  ) {
    return this.runWithoutTransaction(async (session) => {
      const copy = await this.copyModel.findOne({ barcode }).session(session ?? null).exec();
      if (!copy) {
        throw new NotFoundException('Book copy not found');
      }
      const loan = await this.loanModel
        .findOne({
          copy: copy._id,
          status: { $in: [LoanStatus.ISSUED, LoanStatus.OVERDUE] },
        })
        .session(session ?? null)
        .exec();
      if (!loan) {
        throw new NotFoundException('No open loan found for this copy');
      }
      return this.completeReturn(session, loan, copy, condition, actorId, policy);
    });
  }

  markLost(loanId: string, actorId: string, policy: CirculationPolicy) {
    return this.runWithoutTransaction(async (session) => {
      const loan = await this.loanModel
        .findOne({
          _id: loanId,
          status: { $in: [LoanStatus.ISSUED, LoanStatus.OVERDUE] },
        })
        .session(session ?? null)
        .exec();
      if (!loan) {
        throw new NotFoundException('Open loan not found');
      }
      const copy = await this.copyModel.findById(loan.copy).session(session ?? null).exec();
      if (!copy) {
        throw new NotFoundException('Book copy not found');
      }
      return this.completeReturn(session, loan, copy, 'lost', actorId, policy);
    });
  }

  renewLoan(
    loanId: string,
    memberId: string,
    policy: CirculationPolicy,
    actorId?: string,
  ) {
    return this.runWithoutTransaction(async (session) => {
      const loan = await this.loanModel
        .findOne({
          _id: loanId,
          ...(actorId ? {} : { member: memberId }),
          status: LoanStatus.ISSUED,
        })
        .session(session ?? null)
        .exec();
      if (!loan || !loan.dueAt) {
        throw new NotFoundException('Active loan not found');
      }
      if (loan.dueAt <= new Date()) {
        throw new UnprocessableEntityException('Overdue loans cannot be renewed');
      }
      if (loan.renewCount >= loan.maxRenewals) {
        throw new UnprocessableEntityException('Renewal limit reached');
      }

      const waiting = await this.reservationModel
        .exists({ book: loan.book, status: ReservationStatus.WAITING })
        .session(session ?? null);
      if (waiting) {
        throw new UnprocessableEntityException(
          'A waiting reservation prevents renewal',
        );
      }

      const oldDueAt = loan.dueAt;
      const newDueAt = new Date(
        oldDueAt.getTime() + policy.renewDays * 24 * 60 * 60 * 1000,
      );
      const renewedAt = new Date();
      const updated = await this.loanModel
        .findOneAndUpdate(
          {
            _id: loan._id,
            status: LoanStatus.ISSUED,
            renewCount: loan.renewCount,
            dueAt: oldDueAt,
          },
          {
            $set: { dueAt: newDueAt },
            $inc: { renewCount: 1 },
            $push: { renewals: { renewedAt, oldDueAt, newDueAt } },
          },
          { new: true, session },
        )
        .exec();
      if (!updated) {
        throw new ConflictException('Loan changed while it was being renewed');
      }

      return {
        loanId: updated._id.toString(),
        oldDueAt,
        newDueAt,
        renewCount: updated.renewCount,
        renewalsLeft: Math.max(updated.maxRenewals - updated.renewCount, 0),
      };
    });
  }

  requestReturn(loanId: string, memberId: string) {
    return this.loanModel
      .findOneAndUpdate(
        {
          _id: loanId,
          member: memberId,
          status: { $in: [LoanStatus.ISSUED, LoanStatus.OVERDUE] },
        },
        { $set: { returnRequestedAt: new Date() } },
        { new: true },
      )
      .lean()
      .exec()
      .then((loan) => {
        if (!loan) {
          throw new NotFoundException('Active loan not found');
        }
        return { loanId: loan._id.toString(), returnRequestedAt: loan.returnRequestedAt };
      });
  }

  getMemberLoans(memberId: string, status: 'active' | 'history') {
    const memberObjectId = new Types.ObjectId(memberId);
    const filter =
      status === 'history'
        ? {
            member: memberObjectId,
            status: { $in: [LoanStatus.RETURNED, LoanStatus.LOST] },
          }
        : {
            member: memberObjectId,
            status: {
              $in: [LoanStatus.PENDING, LoanStatus.ISSUED, LoanStatus.OVERDUE],
            },
          };
    return this.loanModel
      .find(filter)
      .select('snapshot issuedAt dueAt renewCount maxRenewals status returnedAt returnRequestedAt fine')
      .sort({ createdAt: -1 })
      .populate({ path: 'fine', select: 'amount status daysLate reason' })
      .lean()
      .exec();
  }

  async listAdminLoans(query: AdminLoansQueryDto, overdueOnly = false) {
    let memberFilter: Types.ObjectId | undefined;
    if (query.member) {
      const member = await this.userModel
        .findOne({
          $or: [
            { memberId: query.member },
            ...(/^[\da-f]{24}$/i.test(query.member)
              ? [{ _id: query.member }]
              : []),
          ],
        })
        .select('_id')
        .lean()
        .exec();
      if (!member) {
        return {
          data: [],
          meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
        };
      }
      memberFilter = member._id;
    }

    const filter = {
      ...(overdueOnly
        ? {
            status: { $in: [LoanStatus.OVERDUE, LoanStatus.ISSUED] as const },
            dueAt: { $lt: new Date() },
          }
        : query.status && query.status !== 'all'
          ? { status: loanStatusByQuery[query.status] }
          : {}),
      ...(memberFilter ? { member: memberFilter } : {}),
      ...(query.from || query.to
        ? {
            issuedAt: {
              ...(query.from ? { $gte: new Date(query.from) } : {}),
              ...(query.to ? { $lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const [loans, total] = await Promise.all([
      this.loanModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.loanModel.countDocuments(filter).exec(),
    ]);
    return {
      data: loans,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMemberLookup(memberId: string, policy: CirculationPolicy) {
    const member = await this.userModel.findOne({ memberId }).lean().exec();
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    const activeLoans = await this.loanModel.countDocuments({
      member: member._id,
      status: { $in: activeLoanStatuses },
    });
    const unpaidFines = await this.totalUnpaidFines(member._id);
    return {
      id: member._id.toString(),
      memberId: member.memberId,
      name: member.name,
      status: member.status,
      membershipType: member.membershipType,
      activeLoans,
      unpaidFines,
      canBorrow:
        member.role === Role.MEMBER &&
        member.status === 'active' &&
        activeLoans < this.maxActiveLoans(member.membershipType, policy) &&
        !this.exceedsUnpaidFineLimit(
          unpaidFines,
          policy.unpaidFineBorrowLimit,
        ),
    };
  }

  async searchMemberSuggestions(query: string) {
    const pattern = new RegExp(escapeRegex(query), 'i');
    const members = await this.userModel
      .find({
        role: Role.MEMBER,
        $or: [{ name: pattern }, { memberId: pattern }, { email: pattern }],
      })
      .select('memberId name email membershipType status')
      .sort({ name: 1 })
      .limit(10)
      .lean()
      .exec();

    return members.map((member) => ({
      id: member._id.toString(),
      memberId: member.memberId,
      name: member.name,
      email: member.email,
      membershipType: member.membershipType,
      status: member.status,
    }));
  }

  async searchBookSuggestions(
    query: string,
    copyStatus: BookCopyStatus.AVAILABLE | BookCopyStatus.ISSUED,
  ) {
    const titlePattern = new RegExp(escapeRegex(query), 'i');
    const normalizedIsbn = query.replace(/[-\s]/g, '');
    const isbnPattern = /^[\dXx]+$/.test(normalizedIsbn)
      ? new RegExp(
          normalizedIsbn.split('').map(escapeRegex).join('[-\\s]*'),
          'i',
        )
      : undefined;
    const books = await this.bookModel
      .find({
        status: 'active',
        $or: [
          { title: titlePattern },
          { bookId: titlePattern },
          ...(isbnPattern ? [{ isbn: isbnPattern }] : []),
        ],
      })
      .select('bookId title isbn availableCopies totalCopies')
      .sort({ title: 1 })
      .limit(10)
      .lean()
      .exec();

    if (!books.length) {
      return [];
    }

    const copyGroups = await Promise.all(
      books.map((book) =>
        this.copyModel
          .find({ book: book._id, status: copyStatus })
          .select('book barcode status')
          .sort({ barcode: 1 })
          .limit(10)
          .lean()
          .exec(),
      ),
    );
    const copies = copyGroups.flat();
    const copyIds = copies.map((copy) => copy._id);
    const loans =
      copyStatus === BookCopyStatus.ISSUED
        ? await this.loanModel
            .find({
              copy: { $in: copyIds },
              status: { $in: [LoanStatus.ISSUED, LoanStatus.OVERDUE] },
            })
            .select('copy snapshot.memberName snapshot.memberId dueAt')
            .lean()
            .exec()
        : [];
    const loansByCopy = new Map(
      loans.map((loan) => [loan.copy.toString(), loan]),
    );
    const copiesByBook = new Map<string, typeof copies>();
    for (const copy of copies) {
      const bookId = copy.book.toString();
      const bookCopies = copiesByBook.get(bookId) ?? [];
      bookCopies.push(copy);
      copiesByBook.set(bookId, bookCopies);
    }

    return books.flatMap((book) => {
      const bookCopies = (copiesByBook.get(book._id.toString()) ?? []).filter(
        (copy) =>
          copyStatus !== BookCopyStatus.ISSUED ||
          loansByCopy.has(copy._id.toString()),
      );
      if (!bookCopies.length) {
        return [];
      }
      return [{
        id: book._id.toString(),
        bookId: book.bookId,
        title: book.title,
        isbn: book.isbn,
        availableCopies: book.availableCopies,
        totalCopies: book.totalCopies,
        copies: bookCopies.map((copy) => {
          const loan = loansByCopy.get(copy._id.toString());
          return {
            barcode: copy.barcode,
            status: copy.status,
            currentLoan: loan
              ? {
                  memberName: loan.snapshot.memberName,
                  memberId: loan.snapshot.memberId,
                  dueAt: loan.dueAt,
                }
              : null,
          };
        }),
      }];
    });
  }

  async getCopyLookup(barcode: string) {
    const copy = await this.copyModel.findOne({ barcode }).lean().exec();
    if (!copy) {
      throw new NotFoundException('Book copy not found');
    }
    const book = await this.bookModel.findById(copy.book).lean().exec();
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    const currentLoan = await this.loanModel
      .findOne({
        copy: copy._id,
        status: { $in: activeLoanStatuses },
      })
      .select('snapshot.memberName snapshot.memberId dueAt status')
      .lean()
      .exec();
    return {
      barcode: copy.barcode,
      status: copy.status,
      condition: copy.condition,
      currentLoan: currentLoan
        ? {
            memberName: currentLoan.snapshot.memberName,
            memberId: currentLoan.snapshot.memberId,
            dueAt: currentLoan.dueAt,
            status: currentLoan.status,
          }
        : null,
      book: {
        id: book._id.toString(),
        bookId: book.bookId,
        title: book.title,
        isbn: book.isbn,
      },
    };
  }

  listMemberReservations(memberId: string) {
    const memberObjectId = new Types.ObjectId(memberId);
    return this.reservationModel
      .find({
        member: memberObjectId,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  listAdminReservations(query: AdminReservationsQueryDto) {
    const filter = {
      ...(query.status && query.status !== 'all'
        ? { status: reservationStatusByQuery[query.status] }
        : {}),
      ...(query.book ? { book: query.book } : {}),
    };
    return this.reservationModel
      .find(filter)
      .sort({ book: 1, queuePosition: 1 })
      .lean()
      .exec();
  }

  cancelReservation(
    reservationId: string,
    memberId: string | undefined,
    policy: CirculationPolicy,
  ) {
    return this.runWithoutTransaction(async (session) => {
      const reservation = await this.reservationModel
        .findOne({
          _id: reservationId,
          ...(memberId ? { member: memberId } : {}),
          status: { $in: [ReservationStatus.WAITING, ReservationStatus.READY] },
        })
        .session(session ?? null)
        .exec();
      if (!reservation) {
        throw new NotFoundException('Active reservation not found');
      }

      const cancelled = await this.reservationModel
        .updateOne(
          {
            _id: reservation._id,
            status: reservation.status,
          },
          { $set: { status: ReservationStatus.CANCELLED } },
          { session },
        )
        .exec();
      if (cancelled.modifiedCount !== 1) {
        throw new ConflictException('Reservation is no longer active');
      }
      const reservationCountUpdate = await this.bookModel
        .updateOne(
          { _id: reservation.book, reservationCount: { $gt: 0 } },
          { $inc: { reservationCount: -1 } },
          { session },
        )
        .exec();
      if (reservationCountUpdate.modifiedCount !== 1) {
        throw new ConflictException('Reservation count is inconsistent');
      }

      if (reservation.status === ReservationStatus.READY && reservation.copy) {
        const copy = await this.copyModel
          .findOneAndUpdate(
            { _id: reservation.copy, status: BookCopyStatus.RESERVED },
            {
              $set: { status: BookCopyStatus.AVAILABLE, currentLoan: null },
            },
            { new: true, session },
          )
          .exec();
        if (!copy) {
          throw new ConflictException('Reserved copy is no longer available');
        }
        const stockRelease = await this.bookModel
          .updateOne(
            { _id: reservation.book },
            { $inc: { availableCopies: 1 } },
            { session },
          )
          .exec();
        if (stockRelease.modifiedCount !== 1) {
          throw new ConflictException('Book availability could not be updated');
        }
        const promoted = await this.promoteNextWaiting(
          session,
          reservation.book,
          copy,
          policy,
        );
        if (promoted) {
          const reservedCopy = await this.copyModel
            .updateOne(
              { _id: copy._id, status: BookCopyStatus.AVAILABLE },
              { $set: { status: BookCopyStatus.RESERVED } },
              { session },
            )
            .exec();
          if (reservedCopy.modifiedCount !== 1) {
            throw new ConflictException('Book copy status changed');
          }
          const stockUpdate = await this.bookModel
            .updateOne(
              { _id: reservation.book, availableCopies: { $gt: 0 } },
              { $inc: { availableCopies: -1 } },
              { session },
            )
            .exec();
          if (stockUpdate.modifiedCount !== 1) {
            throw new ConflictException('Book availability changed');
          }
        }
      }
      await this.renumberWaiting(session, reservation.book);
      return { message: 'Reservation cancelled' };
    });
  }

  notifyReservation(reservationId: string, policy: CirculationPolicy) {
    return this.runWithoutTransaction(async (session) => {
      const reservation = await this.reservationModel
        .findOne({
          _id: reservationId,
          status: ReservationStatus.WAITING,
        })
        .session(session ?? null)
        .exec();
      if (!reservation) {
        throw new NotFoundException('Waiting reservation not found');
      }
      const firstInQueue = await this.reservationModel
        .findOne({
          book: reservation.book,
          status: ReservationStatus.WAITING,
        })
        .sort({ queuePosition: 1, createdAt: 1 })
        .session(session ?? null)
        .exec();
      if (!firstInQueue?._id.equals(reservation._id)) {
        throw new ConflictException('Notify reservations in queue order');
      }
      const copy = await this.copyModel
        .findOneAndUpdate(
          { book: reservation.book, status: BookCopyStatus.AVAILABLE },
          { $set: { status: BookCopyStatus.RESERVED } },
          { new: true, session, sort: { barcode: 1 } },
        )
        .exec();
      if (!copy) {
        throw new UnprocessableEntityException('No copies are available');
      }
      const stockUpdate = await this.bookModel
        .updateOne(
          { _id: reservation.book, availableCopies: { $gt: 0 } },
          { $inc: { availableCopies: -1 } },
          { session },
        )
        .exec();
      if (stockUpdate.modifiedCount !== 1) {
        throw new ConflictException('Book availability changed');
      }
      const now = new Date();
      const readyUpdate = await this.reservationModel
        .updateOne(
          { _id: reservation._id, status: ReservationStatus.WAITING },
          {
            $set: {
              status: ReservationStatus.READY,
              copy: copy._id,
              notifiedAt: now,
              holdUntil: this.holdUntil(now, policy),
            },
          },
          { session },
        )
        .exec();
      if (readyUpdate.modifiedCount !== 1) {
        throw new ConflictException('Reservation is no longer waiting');
      }
      await this.createReadyNotification(session, reservation);
      await this.renumberWaiting(session, reservation.book);
      return {
        reservationId: reservation._id.toString(),
        status: ReservationStatus.READY,
        holdUntil: this.holdUntil(now, policy),
      };
    });
  }

  async processScheduledCirculation(
    now: Date,
    policy: CirculationPolicy,
  ) {
    const overdueUpdate = await this.loanModel
      .updateMany(
        {
          status: LoanStatus.ISSUED,
          dueAt: { $lt: now },
        },
        { $set: { status: LoanStatus.OVERDUE } },
      )
      .exec();
    const expiredReservations = await this.reservationModel
      .find({
        status: ReservationStatus.READY,
        holdUntil: { $lte: now },
      })
      .select('_id')
      .lean()
      .exec();
    let expired = 0;

    for (const { _id } of expiredReservations) {
      const didExpire = await this.runWithoutTransaction(async (session) => {
        const reservation = await this.reservationModel
          .findOne({
            _id,
            status: ReservationStatus.READY,
            holdUntil: { $lte: now },
          })
          .session(session ?? null)
          .exec();
        if (!reservation) return false;
        if (!reservation.copy) {
          throw new ConflictException(
            'Expired reservation has no assigned copy',
          );
        }

        const copy = await this.copyModel
          .findOneAndUpdate(
            { _id: reservation.copy, status: BookCopyStatus.RESERVED },
            { $set: { status: BookCopyStatus.AVAILABLE, currentLoan: null } },
            { new: true, session },
          )
          .exec();
        if (!copy) {
          throw new ConflictException(
            'Reserved copy for expired reservation is unavailable',
          );
        }

        const expiration = await this.reservationModel
          .updateOne(
            {
              _id: reservation._id,
              status: ReservationStatus.READY,
              holdUntil: { $lte: now },
            },
            {
              $set: { status: ReservationStatus.EXPIRED },
              $unset: { copy: 1, holdUntil: 1 },
            },
            { session },
          )
          .exec();
        if (expiration.modifiedCount !== 1) {
          throw new ConflictException('Reservation changed during expiration');
        }

        const bookUpdate = await this.bookModel
          .updateOne(
            { _id: reservation.book, reservationCount: { $gt: 0 } },
            { $inc: { availableCopies: 1, reservationCount: -1 } },
            { session },
          )
          .exec();
        if (bookUpdate.modifiedCount !== 1) {
          throw new ConflictException(
            'Book inventory changed during reservation expiration',
          );
        }

        const promoted = await this.promoteNextWaiting(
          session,
          reservation.book,
          copy,
          policy,
        );
        if (promoted) {
          const reservedCopy = await this.copyModel
            .updateOne(
              { _id: copy._id, status: BookCopyStatus.AVAILABLE },
              { $set: { status: BookCopyStatus.RESERVED } },
              { session },
            )
            .exec();
          if (reservedCopy.modifiedCount !== 1) {
            throw new ConflictException('Book copy status changed');
          }
          const stockUpdate = await this.bookModel
            .updateOne(
              { _id: reservation.book, availableCopies: { $gt: 0 } },
              { $inc: { availableCopies: -1 } },
              { session },
            )
            .exec();
          if (stockUpdate.modifiedCount !== 1) {
            throw new ConflictException('Book availability changed');
          }
        }
        return true;
      });
      if (didExpire) expired += 1;
    }

    return { overdue: overdueUpdate.modifiedCount, reservations: expired };
  }

  private async completeReturn(
    session: ClientSession | undefined,
    loan: LoanDocument,
    copy: BookCopyDocument,
    condition: 'good' | 'damaged' | 'lost',
    actorId: string,
    policy: CirculationPolicy,
  ) {
    const now = new Date();
    if (!loan.dueAt) {
      throw new ConflictException('Loan has no due date');
    }
    const daysLate = Math.max(
      0,
      Math.ceil((now.getTime() - loan.dueAt.getTime()) / 86400000),
    );
    const overdueCharge = Math.min(
      daysLate * policy.finePerDay,
      policy.maxFinePerBook,
    );
    const conditionCharge =
      condition === 'damaged'
        ? policy.damagedCharge
        : condition === 'lost'
          ? policy.lostCharge
          : 0;
    const amount = overdueCharge + conditionCharge;
    let fine: { id: string; daysLate: number; amount: number } | null = null;
    let fineId: Types.ObjectId | undefined;

    if (amount > 0) {
      const member = await this.userModel.findById(loan.member).session(session ?? null).exec();
      if (!member) {
        throw new NotFoundException('Loan member no longer exists');
      }
      const reason =
        condition === 'good' ? 'overdue' : condition;
      const [createdFine] = await this.fineModel.create(
        [
          {
            member: loan.member,
            loan: loan._id,
            snapshot: {
              memberName: loan.snapshot.memberName,
              title: loan.snapshot.title,
            },
            reason,
            daysLate,
            ratePerDay: policy.finePerDay,
            amount,
            status: FineStatus.UNPAID,
          },
        ],
        { session },
      );
      fineId = createdFine._id;
      fine = { id: createdFine._id.toString(), daysLate, amount };
      await this.userModel
        .updateOne(
          { _id: loan.member },
          { $inc: { 'stats.unpaidFines': amount } },
          { session },
        )
        .exec();
      await this.notificationModel.create(
        [
          {
            user: loan.member,
            type: 'fine_added',
            title: 'Fine added',
            message: `A fine of ${amount} paise was added for ${loan.snapshot.title}.`,
            link: '/fines',
          },
        ],
        { session },
      );
    }

    const book = await this.bookModel.findById(loan.book).session(session ?? null).exec();
    if (!book) {
      throw new NotFoundException('Loan book no longer exists');
    }
    let nextReservation: {
      member: string;
      status: ReservationStatus;
      holdUntil: Date;
    } | null = null;
    let copyStatus =
      condition === 'good'
        ? BookCopyStatus.AVAILABLE
        : condition === 'damaged'
          ? BookCopyStatus.DAMAGED
          : BookCopyStatus.LOST;

    if (condition === 'good') {
      const promoted = await this.promoteNextWaiting(
        session,
        book._id,
        copy,
        policy,
      );
      if (promoted) {
        copyStatus = BookCopyStatus.RESERVED;
        nextReservation = promoted;
      }
    }

    const copyUpdate = await this.copyModel
      .updateOne(
        {
          _id: copy._id,
          status: BookCopyStatus.ISSUED,
          currentLoan: loan._id,
        },
        {
          $set: {
            status: copyStatus,
            currentLoan: null,
            condition: condition === 'good' ? 'good' : 'poor',
          },
        },
        { session },
      )
      .exec();
    if (copyUpdate.modifiedCount !== 1) {
      throw new ConflictException('Book copy status changed');
    }

    const bookChanges: Record<string, number> = {};
    if (condition === 'good' && !nextReservation) {
      bookChanges.availableCopies = 1;
    }
    if (condition === 'lost') {
      bookChanges.totalCopies = -1;
    }
    if (Object.keys(bookChanges).length > 0) {
      const stockUpdate = await this.bookModel
        .updateOne(
          {
            _id: book._id,
            ...(condition === 'lost' ? { totalCopies: { $gt: 0 } } : {}),
          },
          { $inc: bookChanges },
          { session },
        )
        .exec();
      if (stockUpdate.modifiedCount !== 1) {
        throw new ConflictException('Book stock count is inconsistent');
      }
    }

    const finalLoanStatus =
      condition === 'lost' ? LoanStatus.LOST : LoanStatus.RETURNED;
    const closedLoan = await this.loanModel
      .updateOne(
        { _id: loan._id, status: { $in: [LoanStatus.ISSUED, LoanStatus.OVERDUE] } },
        {
          $set: {
            status: finalLoanStatus,
            returnedAt: now,
            returnCondition: condition,
            returnedTo: new Types.ObjectId(actorId),
            ...(fineId ? { fine: fineId } : {}),
          },
        },
        { session },
      )
      .exec();
    if (closedLoan.modifiedCount !== 1) {
      throw new ConflictException('Loan is no longer active');
    }
    await this.userModel
      .updateOne(
        { _id: loan.member },
        { $inc: { 'stats.activeLoans': -1 } },
        { session },
      )
      .exec();

    return {
      loanId: loan._id.toString(),
      returnedAt: now,
      fine,
      nextReservation,
    };
  }

  private async promoteNextWaiting(
    session: ClientSession | undefined,
    bookId: Types.ObjectId,
    copy: BookCopyDocument,
    policy: CirculationPolicy,
  ) {
    const reservation = await this.reservationModel
      .findOneAndUpdate(
        { book: bookId, status: ReservationStatus.WAITING },
        {
          $set: {
            status: ReservationStatus.READY,
            copy: copy._id,
            notifiedAt: new Date(),
            holdUntil: this.holdUntil(new Date(), policy),
          },
        },
        {
          new: true,
          session,
          sort: { queuePosition: 1, createdAt: 1 },
        },
      )
      .exec();
    if (!reservation) {
      return null;
    }
    await this.renumberWaiting(session, bookId);
    const holdUntil =
      reservation.holdUntil ?? this.holdUntil(new Date(), policy);
    await this.createReadyNotification(session, reservation);
    return {
      member: reservation.snapshot.memberName,
      status: ReservationStatus.READY,
      holdUntil,
    };
  }

  private async createReadyNotification(
    session: ClientSession | undefined,
    reservation: ReservationDocument,
  ) {
    await this.notificationModel.create(
      [
        {
          user: reservation.member,
          type: 'reservation_ready',
          title: 'Your reservation is ready',
          message: `${reservation.snapshot.title} is ready for collection.`,
          link: '/loans',
        },
      ],
      { session },
    );
  }

  private async renumberWaiting(
    session: ClientSession | undefined,
    bookId: Types.ObjectId,
  ) {
    const waiting = await this.reservationModel
      .find({ book: bookId, status: ReservationStatus.WAITING })
      .sort({ queuePosition: 1, createdAt: 1 })
      .session(session ?? null)
      .exec();
    if (waiting.length === 0) {
      return;
    }
    await this.reservationModel.bulkWrite(
      waiting.map((reservation, index) => ({
        updateOne: {
          filter: { _id: reservation._id },
          update: { $set: { queuePosition: index + 1 } },
        },
      })),
      { session },
    );
  }

  private async requireActiveMember(memberId: string, session: ClientSession | undefined) {
    const member = await this.userModel.findById(memberId).session(session ?? null).exec();
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    this.assertActiveMember(member);
    return member;
  }

  private assertActiveMember(member: UserDocument) {
    if (member.role !== Role.MEMBER) {
      throw new ForbiddenException('Only members can borrow or reserve books');
    }
    if (member.status !== 'active') {
      throw new ForbiddenException('Member account is not active');
    }
  }

  private async requireActiveBook(bookId: string, session: ClientSession | undefined) {
    const book = await this.bookModel
      .findOne({ _id: bookId, status: 'active' })
      .session(session ?? null)
      .exec();
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  private async assertNoExistingLoan(
    memberId: Types.ObjectId,
    bookId: Types.ObjectId,
    session: ClientSession | undefined,
  ) {
    const loan = await this.loanModel
      .exists({
        member: memberId,
        book: bookId,
        status: { $in: activeLoanStatuses },
      })
      .session(session ?? null);
    if (loan) {
      throw new ConflictException('Member already has this title');
    }
  }

  private async assertBorrowingAllowed(
    member: UserDocument,
    session: ClientSession | undefined,
    policy: CirculationPolicy,
  ) {
    await this.assertFineLimit(member, session, policy);
    const openLoans = await this.loanModel
      .countDocuments({
        member: member._id,
        status: { $in: activeLoanStatuses },
      })
      .session(session ?? null)
      .exec();
    if (openLoans >= this.maxActiveLoans(member.membershipType, policy)) {
      throw new UnprocessableEntityException('Loan limit reached');
    }
  }

  private async assertFineLimit(
    member: UserDocument,
    session: ClientSession | undefined,
    policy: CirculationPolicy,
  ) {
    const unpaidFines = await this.totalUnpaidFines(member._id, session);
    if (
      this.exceedsUnpaidFineLimit(
        unpaidFines,
        policy.unpaidFineBorrowLimit,
      )
    ) {
      throw new UnprocessableEntityException(
        'Unpaid fines must be cleared before borrowing',
      );
    }
  }

  private async totalUnpaidFines(
    memberId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const aggregate = this.fineModel.aggregate<{ total: number }>([
      {
        $match: {
          member: memberId,
          status: { $in: [FineStatus.UNPAID, FineStatus.PARTIAL] },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
          },
        },
      },
    ]);
    if (session) {
      aggregate.session(session ?? null);
    }
    const [result] = await aggregate.exec();
    return result?.total ?? 0;
  }

  private maxActiveLoans(
    membershipType: string,
    policy: CirculationPolicy,
  ): number {
    return (
      policy.maxActiveLoans[
        membershipType as keyof CirculationPolicy['maxActiveLoans']
      ] ?? policy.maxActiveLoans.public
    );
  }

  private exceedsUnpaidFineLimit(balance: number, limit: number): boolean {
    return balance > 0 && (limit === 0 || balance >= limit);
  }

  private dueDate(
    membershipType: string,
    issuedAt: Date,
    policy: CirculationPolicy,
  ): Date {
    const days =
      policy.loanDays[
        membershipType as keyof CirculationPolicy['loanDays']
      ] ?? policy.loanDays.public;
    return new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private validDueDate(
    requestedDueAt: Date | undefined,
    membershipType: string,
    issuedAt: Date,
    policy: CirculationPolicy,
  ): Date {
    const dueAt = requestedDueAt ?? this.dueDate(membershipType, issuedAt, policy);
    if (dueAt <= issuedAt) {
      throw new UnprocessableEntityException('Due date must be in the future');
    }
    return dueAt;
  }

  private holdUntil(from: Date, policy: CirculationPolicy): Date {
    return new Date(
      from.getTime() + policy.reservationHoldHours * 60 * 60 * 1000,
    );
  }
}
