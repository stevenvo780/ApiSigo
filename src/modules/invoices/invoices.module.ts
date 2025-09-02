import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoiceService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoicesModule {}
