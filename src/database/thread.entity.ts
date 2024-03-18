import { 
	Column, 
	Entity, 
	PrimaryGeneratedColumn 
} from "typeorm";

@Entity()
export class Thread {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  forum_id: number;

  @Column()
  author_email: string;

  @Column()
  thread_title: string;

  @Column("simple-array")
  tag: string[];

  @Column()
  content: string;

  @Column()
  create_date: Date;

  @Column()
  last_update_date: Date;

  @Column()
  replies: number;

  @Column()
  views: number;

  @Column()
  last_message_id: number;

  @Column()
  delete: boolean;
}