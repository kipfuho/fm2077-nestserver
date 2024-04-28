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
  user_id: number;

  @Column()
  thread_title: string;

  @Column("simple-array")
  tag: string[];

  @Column()
  create_time: Date;

  @Column()
  last_update_time: Date;

  @Column()
  replies: number;

  @Column()
  views: number;

  @Column()
  delete: boolean;

  @Column()
  privilege: number;
}