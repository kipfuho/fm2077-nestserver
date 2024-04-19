import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { UserDocument } from 'src/mongodb/schema/user.schema';

@Injectable()
export class MailService {
	constructor(private mailerService: MailerService) {}

  async sendUserConfirmation(user: UserDocument, code: string) {
    await this.mailerService.sendMail({
      to: user.email,
      // from: '"Support Team" <support@example.com>', // override default from
      subject: 'Welcome to Nice App! Confirm your Email',
      template: './confirmation', // `.hbs` extension is appended automatically
      context: { // ✏️ filling curly brackets with content
        name: user.username,
        url: `https://localhost:3000/account/verify-email/userId=${user._id}&code=${code}`,
      },
    });
		return "OK";
  }
}
