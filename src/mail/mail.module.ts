import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          transport: {
            host: configService.get("SMTP_HOST"),
            secure: true,
            auth: {
              user: configService.get("SMTP_USER"),
              pass: configService.get("SMTP_PASS")
            }
          },
          defaults: {
            from: '"No Reply" <noreply@example.com>'
          },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            }
          }
        }
      },
      inject: [ConfigService]
    })
  ],
  providers: [MailService],
  controllers: [MailController]
})
export class MailModule {}
