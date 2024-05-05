import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Report {
	// who made the report
	@Prop()
	reporter: string;

	// target who
	@Prop()
	reported: string;

	// message reported
	@Prop()
	message: string;

	// reason for the report
	// can be spam, duplicated, inappropriate content, etc
	@Prop()
	reason: string;

	// detail
	@Prop()
	detail: string;

	@Prop()
	create_time: Date;
}

export type ReportDocument = HydratedDocument<Report>;
export const ReportSchema = SchemaFactory.createForClass(Report);