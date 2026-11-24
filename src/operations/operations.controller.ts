import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { Role } from '../enums/role.enum.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  AuditLogsQueryDto,
  FineReportQueryDto,
  MostBorrowedQueryDto,
  ReportExportQueryDto,
  ReportRangeQueryDto,
} from './dto/operations.dto.js';
import { OperationsService } from './operations.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedPrincipal };

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LIBRARIAN)
export class AdminOperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.operationsService.getAdminDashboard();
  }

  @Get('reports/circulation')
  getCirculationReport(@Query() query: ReportRangeQueryDto) {
    return this.operationsService.getCirculationReport(query.range);
  }

  @Get('reports/most-borrowed')
  getMostBorrowed(@Query() query: MostBorrowedQueryDto) {
    return this.operationsService.getMostBorrowed(query.limit);
  }

  @Get('reports/overdue')
  getOverdueReport() {
    return this.operationsService.getOverdueReport();
  }

  @Get('reports/fines')
  getFineReport(@Query() query: FineReportQueryDto) {
    return this.operationsService.getFineReport(query);
  }

  @Get('reports/members')
  getMemberReport() {
    return this.operationsService.getMemberReport();
  }

  @Get('reports/categories')
  getCategorySplit() {
    return this.operationsService.getCategorySplit();
  }

  @Get('reports/export')
  async exportReport(
    @Query() query: ReportExportQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.operationsService.exportCirculationCsv(query.range);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="circulation-${query.range}.csv"`,
    );
    return response.status(200).send(csv);
  }

  @Get('audit-logs')
  @Roles(Role.ADMIN)
  listAuditLogs(@Query() query: AuditLogsQueryDto) {
    return this.operationsService.listAuditLogs(query);
  }
}

@Controller('me')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.MEMBER)
export class MemberDashboardController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('dashboard')
  getDashboard(@Req() request: AuthenticatedRequest) {
    return this.operationsService.getMemberDashboard(request.user.userId);
  }
}
