import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Rating {
	// thread rated
	@Prop()
	thread: string;

	// user gave the ratings
	@Prop()
	user: string;

	// score rating 1-> 10
	@Prop()
	score: number;

	// message for the rating
	@Prop()
	message: string;
}

export type RatingDocument = HydratedDocument<Rating>;
export const RatingSchema = SchemaFactory.createForClass(Rating);