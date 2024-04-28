import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class ProfilePosting {
	// who post this
	@Prop()
	user: string;

	// on which user wall
	@Prop()
	user_wall: string;

	// content
	@Prop()
	message: string;

	@Prop()
	create_time: Date;
}

export type ProfilePostingDocument = HydratedDocument<ProfilePosting>;
export const ProfilePostingSchema = SchemaFactory.createForClass(ProfilePosting);