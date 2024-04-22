import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Alert {
	// alert for who
	@Prop()
	user: string;

	// detail of alert
	@Prop()
	detail: string;

	@Prop()
	create_time: Date;

	// user have read the alert?
	@Prop()
	read: boolean;
}

export type AlertDocument = HydratedDocument<Alert>;
export const AlertSchema = SchemaFactory.createForClass(Alert);