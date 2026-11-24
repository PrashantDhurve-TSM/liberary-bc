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
import { Fine, FineStatus } from '../circulation/entities/fine.entity.js';
import { Notification } from '../circulation/entities/notification.entity.js';
import { User } from '../user/entities/user.entity.js';
import {
  AdminFinesQueryDto,
  AdminPaymentsQueryDto,
  CreateManualFineDto,
} from './dto/payment.dto.js';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from './entities/payment.entity.js';

const payableFineStatuses = [FineStatus.UNPAID, FineStatus.PARTIAL];

const paymentStatusByQuery = {
  paid: PaymentStatus.PAID,
};

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Fine.name) private readonly fineModel: Model<Fine>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  private runWithoutTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return work(undefined as unknown as ClientSession);
  }

  async payFinesDemo(
    memberId: string,
    fineIds: string[],
    idempotencyKey: string,
  ) {
    const memberObjectId = new Types.ObjectId(memberId);
    const fineObjectIds = fineIds.map((fineId) => new Types.ObjectId(fineId));
    try {
      return await this.runWithoutTransaction(async (session) => {
        const existingPayment = await this.paymentModel
          .findOne({ member: memberObjectId, idempotencyKey })
          .session(session)
          .exec();
        if (existingPayment) {
          this.assertSameFines(existingPayment, fineIds);
          if (existingPayment.status !== PaymentStatus.PAID) {
            throw new ConflictException('This demo payment is not complete');
          }
          return {
            paymentId: existingPayment._id.toString(),
            receiptNo: existingPayment.receiptNo,
            amount: existingPayment.amount,
            status: existingPayment.status,
            alreadyPaid: true,
          };
        }

        const member = await this.userModel
          .findById(memberId)
          .select('name')
          .session(session)
          .exec();
        if (!member) {
          throw new NotFoundException('Member not found');
        }
        const fines = await this.fineModel
          .find({ _id: { $in: fineObjectIds }, member: memberObjectId })
          .session(session)
          .exec();
        if (fines.length !== fineIds.length) {
          throw new NotFoundException('One or more fines were not found');
        }

        const allocations = fines.map((fine) => {
          if (!payableFineStatuses.includes(fine.status)) {
            throw new UnprocessableEntityException(
              'Only unpaid fines can be paid',
            );
          }
          const amount = fine.amount - fine.paidAmount;
          if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new ConflictException('Fine balance is inconsistent');
          }
          return { fine: fine._id, amount };
        });
        const amount = allocations.reduce(
          (total, allocation) => total + allocation.amount,
          0,
        );
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          throw new UnprocessableEntityException('Payment amount is invalid');
        }

        const paidAt = new Date();
        const [payment] = await this.paymentModel.create(
          [
            {
              member: memberId,
              memberName: member.name,
              allocations,
              amount,
              method: PaymentMethod.DEMO,
              status: PaymentStatus.PAID,
              idempotencyKey,
              paidAt,
            },
          ],
          { session },
        );

        for (const fine of fines) {
          const updatedFine = await this.fineModel
            .updateOne(
              {
                _id: fine._id,
                member: memberObjectId,
                status: { $in: payableFineStatuses },
                paidAmount: fine.paidAmount,
              },
              {
                $set: {
                  paidAmount: fine.amount,
                  status: FineStatus.PAID,
                  paidAt,
                },
              },
              { session },
            )
            .exec();
          if (updatedFine.modifiedCount !== 1) {
            throw new ConflictException(
              'Fine changed while payment was processed',
            );
          }
        }

        await this.decreaseMemberFineBalance(session, member._id, amount);
        const receiptNo = this.receiptNumber(payment._id, paidAt);
        const receiptUpdate = await this.paymentModel
          .updateOne(
            { _id: payment._id },
            { $set: { receiptNo } },
            { session },
          )
          .exec();
        if (receiptUpdate.modifiedCount !== 1) {
          throw new ConflictException('Payment receipt could not be recorded');
        }
        await this.createPaymentNotification(
          session,
          member._id,
          amount,
          PaymentMethod.DEMO,
        );
        return {
          paymentId: payment._id.toString(),
          receiptNo,
          amount,
          status: PaymentStatus.PAID,
          alreadyPaid: false,
        };
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'This demo payment request was already processed',
        );
      }
      throw error;
    }
  }

  async listMemberFines(memberId: string) {
    const memberObjectId = new Types.ObjectId(memberId);
    const [items, totals] = await Promise.all([
      this.fineModel
        .find({ member: memberObjectId })
        .select(
          'snapshot reason description daysLate amount paidAmount status paidAt waivedAt createdAt',
        )
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.fineModel.aggregate<{ totalDue: number }>([
        {
          $match: {
            member: memberObjectId,
            status: { $in: payableFineStatuses },
          },
        },
        {
          $group: {
            _id: null,
            totalDue: {
              $sum: { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
            },
          },
        },
      ]).exec(),
    ]);
    return { totalDue: totals[0]?.totalDue ?? 0, items };
  }

  async listAdminFines(query: AdminFinesQueryDto) {
    let memberFilter: Types.ObjectId | undefined;
    if (query.member) {
      const member = await this.findMember(query.member);
      if (!member) {
        return {
          data: [],
          totals: { pending: 0, collected: 0, waived: 0 },
          meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
        };
      }
      memberFilter = member._id;
    }
    const filter = {
      ...(query.status && query.status !== 'all'
        ? { status: this.fineStatus(query.status) }
        : {}),
      ...(memberFilter ? { member: memberFilter } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { $gte: new Date(query.from) } : {}),
              ...(query.to ? { $lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total, totals] = await Promise.all([
      this.fineModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.fineModel.countDocuments(filter).exec(),
      this.fineModel
        .aggregate<{
          pending: number;
          collected: number;
          waived: number;
        }>([
          { $match: filter },
          {
            $group: {
              _id: null,
              pending: {
                $sum: {
                  $cond: [
                    { $in: ['$status', payableFineStatuses] },
                    { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
                    0,
                  ],
                },
              },
              collected: { $sum: { $ifNull: ['$paidAmount', 0] } },
              waived: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', FineStatus.WAIVED] },
                    { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
    ]);
    return {
      data,
      totals: totals[0] ?? { pending: 0, collected: 0, waived: 0 },
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createManualFine(data: CreateManualFineDto, actorId: string) {
    return this.runWithoutTransaction(async (session) => {
      const member = await this.findMember(data.memberId, session);
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      if (member.role !== Role.MEMBER) {
        throw new ForbiddenException('Fines can only be assigned to members');
      }
      const [fine] = await this.fineModel.create(
        [
          {
            member: member._id,
            snapshot: {
              memberName: member.name,
              title: data.description,
            },
            reason: data.reason,
            description: data.description,
            daysLate: 0,
            ratePerDay: 0,
            amount: data.amount,
            status: FineStatus.UNPAID,
            createdBy: new Types.ObjectId(actorId),
          },
        ],
        { session },
      );
      const statsUpdate = await this.userModel
        .updateOne(
          { _id: member._id },
          { $inc: { 'stats.unpaidFines': data.amount } },
          { session },
        )
        .exec();
      if (statsUpdate.matchedCount !== 1) {
        throw new NotFoundException('Member not found');
      }
      await this.notificationModel.create(
        [
          {
            user: member._id,
            type: 'fine_added',
            title: 'Fine added',
            message: `A fine of ${data.amount} paise was added to your account.`,
            link: '/fines',
          },
        ],
        { session },
      );
      return fine;
    });
  }

  async payFineWithCash(fineId: string, actorId: string) {
    return this.runWithoutTransaction(async (session) => {
      const fine = await this.fineModel.findById(fineId).session(session).exec();
      if (!fine) {
        throw new NotFoundException('Fine not found');
      }
      if (!payableFineStatuses.includes(fine.status)) {
        throw new UnprocessableEntityException('Fine is not payable');
      }
      const outstanding = fine.amount - fine.paidAmount;
      if (!Number.isSafeInteger(outstanding) || outstanding <= 0) {
        throw new ConflictException('Fine balance is inconsistent');
      }
      const paidAt = new Date();
      const [payment] = await this.paymentModel.create(
        [
          {
            member: fine.member,
            memberName: fine.snapshot.memberName,
            allocations: [{ fine: fine._id, amount: outstanding }],
            amount: outstanding,
            method: PaymentMethod.CASH,
            status: PaymentStatus.PAID,
            collectedBy: new Types.ObjectId(actorId),
            paidAt,
          },
        ],
        { session },
      );
      const fineUpdate = await this.fineModel
        .updateOne(
          {
            _id: fine._id,
            status: { $in: payableFineStatuses },
            paidAmount: fine.paidAmount,
          },
          {
            $set: {
              paidAmount: fine.amount,
              status: FineStatus.PAID,
              paidAt,
            },
          },
          { session },
        )
        .exec();
      if (fineUpdate.modifiedCount !== 1) {
        throw new ConflictException('Fine changed during cash collection');
      }
      await this.decreaseMemberFineBalance(session, fine.member, outstanding);
      const receiptNo = this.receiptNumber(payment._id, paidAt);
      await this.paymentModel
        .updateOne(
          { _id: payment._id },
          { $set: { receiptNo } },
          { session },
        )
        .exec();
      await this.createPaymentNotification(
        session,
        fine.member,
        outstanding,
        PaymentMethod.CASH,
      );
      return { paymentId: payment._id.toString(), receiptNo, amount: outstanding };
    });
  }

  async waiveFine(fineId: string, actorId: string, reason: string) {
    return this.runWithoutTransaction(async (session) => {
      const fine = await this.fineModel.findById(fineId).session(session).exec();
      if (!fine) {
        throw new NotFoundException('Fine not found');
      }
      if (!payableFineStatuses.includes(fine.status)) {
        throw new UnprocessableEntityException('Fine cannot be waived');
      }
      const outstanding = fine.amount - fine.paidAmount;
      if (!Number.isSafeInteger(outstanding) || outstanding <= 0) {
        throw new ConflictException('Fine balance is inconsistent');
      }
      const waivedAt = new Date();
      const result = await this.fineModel
        .updateOne(
          {
            _id: fine._id,
            status: { $in: payableFineStatuses },
            paidAmount: fine.paidAmount,
          },
          {
            $set: {
              status: FineStatus.WAIVED,
              waivedBy: new Types.ObjectId(actorId),
              waiveReason: reason,
              waivedAt,
            },
          },
          { session },
        )
        .exec();
      if (result.modifiedCount !== 1) {
        throw new ConflictException('Fine changed while waiving');
      }
      await this.decreaseMemberFineBalance(session, fine.member, outstanding);
      return { fineId: fine._id.toString(), status: FineStatus.WAIVED };
    });
  }

  async listMemberPayments(memberId: string) {
    return this.paymentModel
      .find({ member: memberId })
      .select(
        'amount method status receiptNo paidAt createdAt',
      )
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async listAdminPayments(query: AdminPaymentsQueryDto) {
    let memberFilter: Types.ObjectId | undefined;
    if (query.member) {
      const member = await this.findMember(query.member);
      if (!member) {
        return {
          data: [],
          meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
        };
      }
      memberFilter = member._id;
    }
    const filter = {
      ...(query.status && query.status !== 'all'
        ? { status: paymentStatusByQuery[query.status] }
        : {}),
      ...(memberFilter ? { member: memberFilter } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { $gte: new Date(query.from) } : {}),
              ...(query.to ? { $lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .select(
          'member allocations amount method status receiptNo collectedBy paidAt createdAt',
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMemberReceipt(paymentId: string, memberId: string) {
    const payment = await this.paymentModel
      .findOne({
        _id: paymentId,
        member: memberId,
        status: PaymentStatus.PAID,
      })
      .lean()
      .exec();
    if (!payment) {
      throw new NotFoundException('Paid receipt not found');
    }
    const fines = await this.fineModel
      .find({
        _id: { $in: payment.allocations.map((item) => item.fine) },
        member: memberId,
      })
      .select('snapshot reason description amount')
      .lean()
      .exec();
    return {
      payment,
      memberName: payment.memberName,
      fines: payment.allocations.map((allocation) => {
        const fine = fines.find((item) => item._id.equals(allocation.fine));
        if (!fine) {
          throw new ConflictException('Receipt fine was not found');
        }
        return {
          title: fine.snapshot.title,
          reason: fine.reason,
          amount: allocation.amount,
        };
      }),
    };
  }

  private async createPaymentNotification(
    session: ClientSession,
    memberId: Types.ObjectId,
    amount: number,
    method: PaymentMethod,
  ) {
    const isDemo = method === PaymentMethod.DEMO;
    await this.notificationModel.create(
      [
        {
          user: memberId,
          type: 'payment_success',
          title: isDemo ? 'Demo payment recorded' : 'Payment received',
          message: isDemo
            ? `A demo payment of ${amount} paise was recorded. No money was charged.`
            : `Your payment of ${amount} paise has been received.`,
          link: '/fines',
        },
      ],
      { session },
    );
  }

  private async decreaseMemberFineBalance(
    session: ClientSession,
    memberId: Types.ObjectId,
    amount: number,
  ) {
    const update = await this.userModel
      .updateOne(
        { _id: memberId, 'stats.unpaidFines': { $gte: amount } },
        { $inc: { 'stats.unpaidFines': -amount } },
        { session },
      )
      .exec();
    if (update.modifiedCount !== 1) {
      throw new ConflictException('Member fine balance is inconsistent');
    }
  }

  private async findMember(memberId: string, session?: ClientSession) {
    const filter = {
      $or: [
        { memberId },
        ...(/^[\da-f]{24}$/i.test(memberId) ? [{ _id: memberId }] : []),
      ],
    };
    const query = this.userModel.findOne(filter);
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  private assertSameFines(payment: Payment, requestedFineIds: string[]) {
    const currentIds = payment.allocations
      .map((allocation) => allocation.fine.toString())
      .sort();
    const requestedIds = [...requestedFineIds].sort();
    if (
      currentIds.length !== requestedIds.length ||
      currentIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new ConflictException(
        'Idempotency key is already associated with a different payment',
      );
    }
  }

  private fineStatus(
    status: Exclude<AdminFinesQueryDto['status'], 'all' | undefined>,
  ) {
    return {
      unpaid: FineStatus.UNPAID,
      partial: FineStatus.PARTIAL,
      paid: FineStatus.PAID,
      waived: FineStatus.WAIVED,
    }[status];
  }

  private receiptNumber(paymentId: Types.ObjectId, paidAt: Date) {
    const date = paidAt.toISOString().slice(0, 10).replaceAll('-', '');
    return `LIB-${date}-${paymentId.toString().toUpperCase()}`;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
