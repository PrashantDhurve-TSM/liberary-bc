import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CirculationService } from './circulation.service.js';

const schedulerIntervalMs = 60_000;

@Injectable()
export class CirculationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CirculationScheduler.name);
  private interval?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly circulationService: CirculationService) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      void this.run();
    }, schedulerIntervalMs);
    this.interval.unref();
    void this.run();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const result =
        await this.circulationService.processScheduledCirculation();
      if (result.overdue || result.reservations) {
        this.logger.log(
          `Updated ${result.overdue} overdue loans and expired ${result.reservations} reservations`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Scheduled circulation processing failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
