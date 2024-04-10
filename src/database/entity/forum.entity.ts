import { 
	Column, 
	Entity, 
	PrimaryGeneratedColumn 
} from "typeorm";

@Entity()
export class Forum {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  category_id: number;

  @Column()
  forum_name: string;

  @Column("varchar", { length: 5000 })
  about: string;

  @Column()
  threads: number;

  @Column()
  messages: number;

  @Column()
  delete: boolean;

  @Column()
  privilege: number;
}