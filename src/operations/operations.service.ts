import { Injectable } from '@nestjs/common';
import {
  AuditLogsQueryDto,
  FineReportQueryDto,
} from './dto/operations.dto.js';
import { OperationsRepository } from './operations.repository.js';

@Injectable()
export class OperationsService {
  constructor(private readonly operationsRepository: OperationsRepository) {}

  getMemberDashboard(memberId: string) {
    return this.operationsRepository.getMemberDashboard(memberId);
  }

  getAdminDashboard() {
    return this.operationsRepository.getAdminDashboard();
  }

  getCirculationReport(range: 'week' | 'month') {
    return this.operationsRepository.getCirculationReport(range);
  }

  getMostBorrowed(limit: number) {
    return this.operationsRepository.getMostBorrowed(limit);
  }

  getOverdueReport() {
    return this.operationsRepository.getOverdueReport();
  }

  getFineReport(query: FineReportQueryDto) {
    return this.operationsRepository.getFineReport(query);
  }

  getMemberReport() {
    return this.operationsRepository.getMemberReport();
  }

  getCategorySplit() {
    return this.operationsRepository.getCategorySplit();
  }

  listAuditLogs(query: AuditLogsQueryDto) {
    return this.operationsRepository.listAuditLogs(query);
  }

  exportCirculationCsv(range: 'week' | 'month') {
    return this.operationsRepository.exportCirculationCsv(range);
  }
}
