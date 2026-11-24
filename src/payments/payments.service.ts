import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AdminFinesQueryDto,
  AdminPaymentsQueryDto,
  CreateDemoPaymentDto,
  CreateManualFineDto,
  PayFineDto,
  WaiveFineDto,
} from './dto/payment.dto.js';
import { PaymentsRepository } from './payments.repository.js';
import { createReceiptPdf } from './receipt-pdf.js';

@Injectable()
export class PaymentsService {
  constructor(private readonly repository: PaymentsRepository) {}

  payFinesDemo(
    memberId: string,
    data: CreateDemoPaymentDto,
    idempotencyKey: string | undefined,
  ) {
    this.assertObjectId(memberId);
    if (data.fineIds.some((id) => !/^[\da-f]{24}$/i.test(id))) {
      throw new BadRequestException('Invalid fine identifier');
    }
    const fineIds = data.fineIds.map((id) => id.toLowerCase());
    if (new Set(fineIds).size !== fineIds.length) {
      throw new BadRequestException('Fine identifiers must be unique');
    }
    this.assertIdempotencyKey(idempotencyKey);
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.repository.payFinesDemo(memberId, fineIds, idempotencyKey);
  }

  listMemberFines(memberId: string) {
    this.assertObjectId(memberId);
    return this.repository.listMemberFines(memberId);
  }

  listAdminFines(query: AdminFinesQueryDto) {
    this.assertDateRange(query.from, query.to);
    return this.repository.listAdminFines(query);
  }

  createManualFine(actorId: string, data: CreateManualFineDto) {
    this.assertObjectId(actorId);
    if (!Number.isSafeInteger(data.amount) || data.amount < 1) {
      throw new BadRequestException(
        'Fine amount must be a positive integer in paise',
      );
    }
    const description = data.description.trim();
    if (!description) {
      throw new BadRequestException('Fine description is required');
    }
    return this.repository.createManualFine(
      { ...data, description },
      actorId,
    );
  }

  payFineWithCash(actorId: string, fineId: string, data: PayFineDto) {
    this.assertObjectId(actorId);
    this.assertObjectId(fineId);
    if (data.method !== 'cash') {
      throw new BadRequestException(
        'Only cash collection is supported at the desk',
      );
    }
    return this.repository.payFineWithCash(fineId, actorId);
  }

  waiveFine(actorId: string, fineId: string, data: WaiveFineDto) {
    this.assertObjectId(actorId);
    this.assertObjectId(fineId);
    const reason = data.reason.trim();
    if (!reason) {
      throw new BadRequestException('A waiver reason is required');
    }
    return this.repository.waiveFine(fineId, actorId, reason);
  }

  listMemberPayments(memberId: string) {
    this.assertObjectId(memberId);
    return this.repository.listMemberPayments(memberId);
  }

  listAdminPayments(query: AdminPaymentsQueryDto) {
    this.assertDateRange(query.from, query.to);
    return this.repository.listAdminPayments(query);
  }

  async memberReceipt(memberId: string, paymentId: string) {
    this.assertObjectId(memberId);
    this.assertObjectId(paymentId);
    const receipt = await this.repository.getMemberReceipt(paymentId, memberId);
    if (!receipt.payment.receiptNo || !receipt.payment.paidAt) {
      throw new ConflictException('Payment receipt is not ready');
    }
    const pdf = createReceiptPdf({
      receiptNo: receipt.payment.receiptNo,
      memberName: receipt.memberName,
      paidAt: receipt.payment.paidAt,
      method: receipt.payment.method,
      amount: receipt.payment.amount,
      fines: receipt.fines,
    });
    return {
      receiptNo: receipt.payment.receiptNo,
      pdf,
    };
  }

  private assertObjectId(id: string) {
    if (!/^[\da-f]{24}$/i.test(id)) {
      throw new BadRequestException('Invalid identifier');
    }
  }

  private assertIdempotencyKey(key?: string) {
    if (
      key !== undefined &&
      (!/^[\w.:-]{1,128}$/.test(key) || key.trim() !== key)
    ) {
      throw new BadRequestException('Invalid Idempotency-Key header');
    }
  }

  private assertDateRange(from?: string, to?: string) {
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'The start date must be before the end date',
      );
    }
  }
}
