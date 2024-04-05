import { Module } from '@nestjs/common';
import { ModeratorService } from './moderator.service';
import { ModeratorController } from './moderator.controller';
import { DatabaseModule } from 'src/database/db.module';

@Module({
  imports: [DatabaseModule],
  providers: [ModeratorService],
  controllers: [ModeratorController]
})
export class ModeratorModule {}
