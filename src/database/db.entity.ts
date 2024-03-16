import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Login {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  create_time: Date;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  email: string;
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  avatar: string;

  @Column()
  date_of_birth: Date;

  @Column()
  location: string;

  @Column()
  website: string;

  @Column()
  about: string;

  @Column()
  twofa: boolean;
}

@Entity()
export class Forum {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  category: string;

  @Column()
  forum_name: string;

  @Column()
  about: string;

  @Column()
  threads: number;

  @Column()
  messages: number;
}

export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  thread_id: number;

  @Column()
  sender_email: string;

  @Column()
  send_time: Date;

  @Column()
  content: string;

  @Column()
  delete: boolean;
}

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