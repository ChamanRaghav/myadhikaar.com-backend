import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service.js';

@Global()
@Module({
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
