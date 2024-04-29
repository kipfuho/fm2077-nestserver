import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class DeletedItem {
	// Which class this item belong to
	@Prop()
	className: string;

	@Prop()
	item: string;
}

export type DeletedItemDocument = HydratedDocument<DeletedItem>;
export const DeletedItemSchema = SchemaFactory.createForClass(DeletedItem);