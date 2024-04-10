import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

@Schema()
export class Reaction {
	@Prop()
	message: string;

	@Prop()
	user: string;

	@Prop()
	type: string;

	@Prop()
	create_time: Date;
}

export type ReactionDocument = HydratedDocument<Reaction>;
export const ReactionSchema = SchemaFactory.createForClass(Reaction);