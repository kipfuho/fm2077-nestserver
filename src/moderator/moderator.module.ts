import { Module } from '@nestjs/common';
import { ModeratorService } from './moderator.service';
import { ModeratorController } from './moderator.controller';

@Module({
  imports: [],
  providers: [ModeratorService],
  controllers: [ModeratorController]
})
export class ModeratorModule {}
