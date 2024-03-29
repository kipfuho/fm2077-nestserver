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

  @Column("varchar", { length: 10000 })
  content: string;

  @Column()
  create_time: Date;

  @Column()
  last_update_time: Date;

  @Column()
  replies: number;

  @Column()
  views: number;

  @Column("simple-array")
  reactions: number[];

  @Column()
  last_message_id: number;

  @Column()
  delete: boolean;
}