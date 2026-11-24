import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  AdminLoansQueryDto,
  AdminReservationsQueryDto,
  IssueLoanDto,
  MemberLoansQueryDto,
  ReturnLoanDto,
} from './dto/circulation.dto.js';
import { CirculationRepository } from './circulation.repository.js';
import { LibrarySettingsService } from '../settings/library-settings.service.js';
import { BookCopyStatus } from '../catalog/entities/book-copy.entity.js';

@Injectable()
export class CirculationService {
  constructor(
    private readonly repository: CirculationRepository,
    private readonly settingsService: LibrarySettingsService,
  ) {}

  async borrowBook(memberId: string, bookId: string) {
    this.assertObjectId(memberId);
    this.assertObjectId(bookId);
    const settings = await this.settingsService.getSettings();
    return this.repository.requestBorrow(
      memberId,
      bookId,
      settings.selfCheckout,
      settings,
    );
  }

  reserveBook(memberId: string, bookId: string) {
    this.assertObjectId(memberId);
    this.assertObjectId(bookId);
    return this.repository.reserveBook(memberId, bookId);
  }

  getMemberLoans(memberId: string, query: MemberLoansQueryDto) {
    this.assertObjectId(memberId);
    return this.repository.getMemberLoans(memberId, query.status ?? 'active');
  }

  getMemberReservations(memberId: string) {
    this.assertObjectId(memberId);
    return this.repository.listMemberReservations(memberId);
  }

  async cancelMemberReservation(memberId: string, reservationId: string) {
    this.assertObjectId(memberId);
    this.assertObjectId(reservationId);
    const settings = await this.settingsService.getSettings();
    return this.repository.cancelReservation(reservationId, memberId, settings);
  }

  async renewMemberLoan(memberId: string, loanId: string) {
    this.assertObjectId(memberId);
    this.assertObjectId(loanId);
    const settings = await this.settingsService.getSettings();
    return this.repository.renewLoan(loanId, memberId, settings);
  }

  requestReturn(memberId: string, loanId: string) {
    this.assertObjectId(memberId);
    this.assertObjectId(loanId);
    return this.repository.requestReturn(loanId, memberId);
  }

  async issueAtDesk(actorId: string, data: IssueLoanDto) {
    this.assertObjectId(actorId);
    const settings = await this.settingsService.getSettings();
    const dueAt = data.dueAt ? new Date(data.dueAt) : undefined;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Invalid due date');
    }
    return this.repository.issueAtDesk(
      data.memberId.trim(),
      data.barcode.trim(),
      actorId,
      dueAt,
      settings,
    );
  }

  async returnAtDesk(actorId: string, data: ReturnLoanDto) {
    this.assertObjectId(actorId);
    const settings = await this.settingsService.getSettings();
    return this.repository.returnByBarcode(
      data.barcode.trim(),
      data.condition,
      actorId,
      settings,
    );
  }

  async renewAtDesk(actorId: string, loanId: string) {
    this.assertObjectId(actorId);
    this.assertObjectId(loanId);
    const settings = await this.settingsService.getSettings();
    return this.repository.renewLoan(loanId, '', settings, actorId);
  }

  async markLost(actorId: string, loanId: string) {
    this.assertObjectId(actorId);
    this.assertObjectId(loanId);
    const settings = await this.settingsService.getSettings();
    return this.repository.markLost(loanId, actorId, settings);
  }

  listAdminLoans(query: AdminLoansQueryDto) {
    this.assertDateRange(query.from, query.to);
    return this.repository.listAdminLoans(query);
  }

  listOverdueLoans(query: AdminLoansQueryDto) {
    this.assertDateRange(query.from, query.to);
    return this.repository.listAdminLoans(query, true);
  }

  async lookupMember(memberId: string) {
    if (!memberId.trim()) {
      throw new BadRequestException('Member ID is required');
    }
    const settings = await this.settingsService.getSettings();
    return this.repository.getMemberLookup(memberId.trim(), settings);
  }

  searchMemberSuggestions(query: string) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length > 100) {
      throw new BadRequestException('Search text must be 100 characters or fewer');
    }
    if (normalizedQuery.length < 2) {
      return [];
    }
    return this.repository.searchMemberSuggestions(normalizedQuery);
  }

  searchBookSuggestions(query: string, copyStatus: string) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length > 100) {
      throw new BadRequestException('Search text must be 100 characters or fewer');
    }
    if (normalizedQuery.length < 2) {
      return [];
    }
    if (
      copyStatus !== BookCopyStatus.AVAILABLE &&
      copyStatus !== BookCopyStatus.ISSUED
    ) {
      throw new BadRequestException('Invalid copy status');
    }
    return this.repository.searchBookSuggestions(
      normalizedQuery,
      copyStatus,
    );
  }

  lookupCopy(barcode: string) {
    if (!barcode.trim()) {
      throw new BadRequestException('Barcode is required');
    }
    return this.repository.getCopyLookup(barcode.trim());
  }

  listAdminReservations(query: AdminReservationsQueryDto) {
    if (query.book && /^[\da-f]{24}$/i.test(query.book)) {
      return this.repository.listAdminReservations(query);
    }
    if (query.book) {
      throw new BadRequestException('Book filter must be a MongoDB ID');
    }
    return this.repository.listAdminReservations(query);
  }

  async notifyReservation(id: string) {
    this.assertObjectId(id);
    const settings = await this.settingsService.getSettings();
    return this.repository.notifyReservation(id, settings);
  }

  async cancelAdminReservation(id: string) {
    this.assertObjectId(id);
    const settings = await this.settingsService.getSettings();
    return this.repository.cancelReservation(id, undefined, settings);
  }

  async processScheduledCirculation(now = new Date()) {
    const settings = await this.settingsService.getSettings();
    return this.repository.processScheduledCirculation(now, settings);
  }

  private assertObjectId(id: string): void {
    if (!/^[\da-f]{24}$/i.test(id)) {
      throw new BadRequestException('Invalid identifier');
    }
  }

  private assertDateRange(from?: string, to?: string): void {
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'The start date must be before the end date',
      );
    }
  }
}
