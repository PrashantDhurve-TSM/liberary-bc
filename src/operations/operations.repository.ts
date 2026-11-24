import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { Book } from '../catalog/entities/book.entity.js';
import { Fine, FineStatus } from '../circulation/entities/fine.entity.js';
import { Loan, LoanStatus } from '../circulation/entities/loan.entity.js';
import {
  Reservation,
  ReservationStatus,
} from '../circulation/entities/reservation.entity.js';
import { Role } from '../enums/role.enum.js';
import { Payment, PaymentMethod, PaymentStatus } from '../payments/entities/payment.entity.js';
import { User } from '../user/entities/user.entity.js';
import { AuditLog } from './entities/audit-log.entity.js';
import {
  AuditLogsQueryDto,
  FineReportQueryDto,
} from './dto/operations.dto.js';

const openLoanStatuses = [LoanStatus.ISSUED, LoanStatus.OVERDUE];
const payableFineStatuses = [FineStatus.UNPAID, FineStatus.PARTIAL];

interface DateCount {
  _id: string;
  count: number;
}

type DateRange = { $gte?: Date; $lte?: Date };

@Injectable()
export class OperationsRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @InjectModel(Loan.name) private readonly loanModel: Model<Loan>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<Reservation>,
    @InjectModel(Fine.name) private readonly fineModel: Model<Fine>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLog>,
  ) {}

  async getMemberDashboard(memberId: string) {
    const memberObjectId = new Types.ObjectId(memberId);
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [
      member,
      borrowed,
      dueThisWeek,
      reservations,
      overdue,
      currentLoans,
      newArrivals,
    ] = await Promise.all([
        this.userModel
          .findOne({ _id: memberObjectId, role: Role.MEMBER })
          .select('stats')
          .lean()
          .exec(),
        this.loanModel.countDocuments({
          member: memberObjectId,
          status: { $in: openLoanStatuses },
        }),
        this.loanModel.countDocuments({
          member: memberObjectId,
          status: { $in: openLoanStatuses },
          dueAt: { $gte: now, $lt: dueSoon },
        }),
        this.reservationModel.countDocuments({
          member: memberObjectId,
          status: { $in: [ReservationStatus.WAITING, ReservationStatus.READY] },
        }),
        this.loanModel.countDocuments({
          member: memberObjectId,
          status: { $in: openLoanStatuses },
          dueAt: { $lt: now },
        }),
        this.loanModel
          .find({ member: memberObjectId, status: { $in: openLoanStatuses } })
          .select('snapshot issuedAt dueAt status')
          .sort({ dueAt: 1 })
          .limit(5)
          .lean()
          .exec(),
        this.bookModel
          .find({ status: 'active' })
          .select('bookId title authors coverUrl createdAt')
          .sort({ createdAt: -1 })
          .limit(4)
          .lean()
          .exec(),
      ]);
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return {
      stats: {
        borrowed,
        dueThisWeek,
        reservations,
        overdue,
        pendingFines: member.stats?.unpaidFines ?? 0,
      },
      currentLoans: currentLoans.map((loan) => ({
        ...loan,
        status:
          loan.status === LoanStatus.ISSUED && loan.dueAt && loan.dueAt < now
            ? LoanStatus.OVERDUE
            : loan.status,
      })),
      newArrivals,
    };
  }

  async getAdminDashboard() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    const overdueFilter = {
      status: { $in: openLoanStatuses },
      dueAt: { $lt: now },
    };
    const [
      bookCounts,
      members,
      issuedToday,
      overdue,
      recentLoans,
      overdueLoans,
      circulation,
    ] = await Promise.all([
      this.bookModel.aggregate<{ total: number }>([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$totalCopies' } } },
      ]).exec(),
      this.userModel.countDocuments({ role: Role.MEMBER }),
      this.loanModel.countDocuments({
        issuedAt: { $gte: startOfDay, $lt: endOfDay },
      }),
      this.loanModel.countDocuments(overdueFilter),
      this.loanModel
        .find()
        .select('snapshot status issuedAt returnedAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean()
        .exec(),
      this.loanModel
        .find(overdueFilter)
        .select('snapshot dueAt status')
        .sort({ dueAt: 1 })
        .limit(5)
        .lean()
        .exec(),
      this.getCirculationReport('week'),
    ]);

    return {
      stats: {
        totalBooks: bookCounts[0]?.total ?? 0,
        members,
        issuedToday,
        overdue,
      },
      circulation: circulation.data,
      overdueLoans: overdueLoans.map((loan) => ({
        ...loan,
        daysLate: loan.dueAt
          ? Math.max(
              1,
              Math.ceil((now.getTime() - loan.dueAt.getTime()) / 86_400_000),
            )
          : 0,
      })),
      recentActivity: recentLoans.map((loan) => ({
        member: loan.snapshot.memberName,
        book: loan.snapshot.title,
        action: this.loanAction(loan.status, loan.returnedAt),
        at: loan.updatedAt,
      })),
    };
  }

  async getCirculationReport(range: 'week' | 'month') {
    const days = range === 'week' ? 7 : 30;
    const end = new Date();
    end.setUTCHours(24, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    const [issued, returned] = await Promise.all([
      this.countByDate('issuedAt', start, end),
      this.countByDate('returnedAt', start, end),
    ]);
    const issuedByDate = new Map<string, number>();
    for (const item of issued) issuedByDate.set(item._id, item.count);
    const returnedByDate = new Map<string, number>();
    for (const item of returned) returnedByDate.set(item._id, item.count);
    const daily = Array.from({ length: days }, (_value, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const dateKey = date.toISOString().slice(0, 10);
      return {
        date: dateKey,
        label:
          range === 'week'
            ? new Intl.DateTimeFormat('en', {
                weekday: 'short',
                timeZone: 'UTC',
              }).format(date)
            : new Intl.DateTimeFormat('en', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              }).format(date),
        issued: issuedByDate.get(dateKey) ?? 0,
        returned: returnedByDate.get(dateKey) ?? 0,
      };
    });

    if (range === 'week') {
      return { range, data: daily };
    }

    const weekly = new Map<number, (typeof daily)[number]>();
    for (const [index, item] of daily.entries()) {
      const week = Math.floor(index / 7);
      const bucket = weekly.get(week);
      if (bucket) {
        bucket.issued += item.issued;
        bucket.returned += item.returned;
      } else {
        weekly.set(week, {
          ...item,
          label: `Week ${week + 1}`,
        });
      }
    }
    return { range, data: [...weekly.values()] };
  }

  async getMostBorrowed(limit: number) {
    const books = await this.bookModel
      .find({ status: 'active' })
      .select('bookId title borrowCount')
      .sort({ borrowCount: -1, title: 1 })
      .limit(limit)
      .lean()
      .exec();
    return books.map((book) => ({
      bookId: book.bookId,
      title: book.title,
      times: book.borrowCount,
    }));
  }

  async getOverdueReport() {
    const filter = {
      status: { $in: openLoanStatuses },
      dueAt: { $lt: new Date() },
    };
    const [total, loans] = await Promise.all([
      this.loanModel.countDocuments(filter),
      this.loanModel
        .find(filter)
        .select('snapshot dueAt status')
        .sort({ dueAt: 1 })
        .limit(100)
        .lean()
        .exec(),
    ]);
    const now = Date.now();
    return {
      total,
      data: loans.map((loan) => ({
        ...loan,
        daysLate: loan.dueAt
          ? Math.max(1, Math.ceil((now - loan.dueAt.getTime()) / 86_400_000))
          : 0,
      })),
    };
  }

  async getFineReport(query: FineReportQueryDto) {
    const dateRange = this.dateRange(query.from, query.to);
    const pendingFilter = {
      status: { $in: payableFineStatuses },
      ...(dateRange ? { createdAt: dateRange } : {}),
    };
    const paidAtRange = this.dateRange(query.from, query.to);
    const waivedAtRange = this.dateRange(query.from, query.to);
    const [pending, collected, waived, demoRecorded] = await Promise.all([
      this.fineModel.aggregate<{ total: number }>([
        { $match: pendingFilter },
        {
          $group: {
            _id: null,
            total: {
              $sum: { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
            },
          },
        },
      ]).exec(),
      this.paymentTotal(PaymentMethod.CASH, paidAtRange),
      this.fineModel.aggregate<{ total: number }>([
        {
          $match: {
            status: FineStatus.WAIVED,
            ...(waivedAtRange ? { waivedAt: waivedAtRange } : {}),
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
      ]).exec(),
      this.paymentTotal(PaymentMethod.DEMO, paidAtRange),
    ]);
    return {
      pending: pending[0]?.total ?? 0,
      collected,
      waived: waived[0]?.total ?? 0,
      demoRecorded,
    };
  }

  async getMemberReport() {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCMonth(start.getUTCMonth() - 11);
    return this.userModel.aggregate<{
      month: string;
      membershipType: string;
      count: number;
    }>([
      {
        $match: {
          role: Role.MEMBER,
          createdAt: { $gte: start },
        },
      },
      {
        $group: {
          _id: {
            month: {
              $dateToString: {
                format: '%Y-%m',
                date: '$createdAt',
                timezone: 'UTC',
              },
            },
            membershipType: '$membershipType',
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: '$_id.month',
          membershipType: '$_id.membershipType',
          count: 1,
        },
      },
      { $sort: { month: 1, membershipType: 1 } },
    ]).exec();
  }

  async getCategorySplit() {
    const counts = await this.bookModel.aggregate<{
      name: string;
      count: number;
    }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$categoryName', count: { $sum: 1 } } },
      { $project: { _id: 0, name: '$_id', count: 1 } },
      { $sort: { count: -1, name: 1 } },
    ]).exec();
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    return counts.map((item) => ({
      ...item,
      pct: total === 0 ? 0 : Math.round((item.count / total) * 100),
    }));
  }

  async listAuditLogs(query: AuditLogsQueryDto) {
    const filter = {
      ...(query.actor ? { actor: new Types.ObjectId(query.actor) } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(this.dateRange(query.from, query.to)
        ? { createdAt: this.dateRange(query.from, query.to) }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .populate('actor', 'name memberId role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async exportCirculationCsv(range: 'week' | 'month') {
    const { data } = await this.getCirculationReport(range);
    const rows = [
      ['date', 'label', 'issued', 'returned'],
      ...data.map((item) => [
        item.date,
        item.label,
        String(item.issued),
        String(item.returned),
      ]),
    ];
    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\r\n');
  }

  private countByDate(field: 'issuedAt' | 'returnedAt', start: Date, end: Date) {
    return this.loanModel.aggregate<DateCount>([
      { $match: { [field]: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: `$${field}`,
              timezone: 'UTC',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]).exec();
  }

  private async paymentTotal(method: PaymentMethod, paidAtRange?: DateRange) {
    const [result] = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          method,
          status: PaymentStatus.PAID,
          ...(paidAtRange ? { paidAt: paidAtRange } : {}),
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).exec();
    return result?.total ?? 0;
  }

  private dateRange(from?: string, to?: string): DateRange | undefined {
    if (!from && !to) return undefined;
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    if (start && end && start > end) {
      throw new BadRequestException('"from" must be earlier than or equal to "to"');
    }
    if (end) end.setUTCHours(23, 59, 59, 999);
    return {
      ...(start ? { $gte: start } : {}),
      ...(end ? { $lte: end } : {}),
    };
  }

  private loanAction(status: LoanStatus, returnedAt?: Date | null) {
    if (returnedAt || status === LoanStatus.RETURNED) return 'Returned';
    if (status === LoanStatus.OVERDUE) return 'Overdue';
    if (status === LoanStatus.PENDING) return 'Requested';
    if (status === LoanStatus.LOST) return 'Lost';
    return 'Issued';
  }

  private csvCell(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
  }
}
