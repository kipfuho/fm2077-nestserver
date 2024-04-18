import { Controller, Get } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
	constructor(
		private readonly mailService: MailService
	) {}

	@Get("test")
	async sendmail() {
		const result = await this.mailService.sendUserConfirmation("ctcakip@gmail.com");
		return result;
	}
}
