import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema()
export class User {
	@Prop()
	username: string;
	
	@Prop()
	email: string;
	
	@Prop()
	password: string;

	@Prop()
	create_time: Date;

	@Prop()
	avatar: string;

	@Prop()
	messages: number;

	@Prop()
	likes: number;

	// list of following
	@Prop({type: [{type: String}]})
	followings: string[];

	// list of follower
	@Prop({type: [{type: String}]})
	followers: string[];
	
	@Prop()
	class: number;
	
	@Prop({type: {
		date_of_birth: {type: Date},
		location: {type: String},
		website: {type: String},
		about: {type: String},
		twofa: {type: Boolean},
		_id: false
	}})
	setting: {
		date_of_birth: Date;
		location: string;
		website: string;
		about: string;
		twofa: boolean;
	};
}

export const UserSchema = SchemaFactory.createForClass(User);