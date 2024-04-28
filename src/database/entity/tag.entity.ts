import { Column, Entity } from "typeorm";

@Entity()
export class Tag {
	@Column()
	tag: string;
	
	@Column()
	color: string;
}