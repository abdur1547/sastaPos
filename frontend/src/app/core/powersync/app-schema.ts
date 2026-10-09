import { column, Schema, Table } from '@powersync/common';

// Mirrors the "lists" and "todos" tables configured in the PowerSync Cloud
// sync streams for this project. Add new tables here as sync streams are added.
const lists = new Table({
  created_at: column.text,
  archived: column.integer,
});

const todos = new Table({
  created_at: column.text,
  name: column.text,
});

export const AppSchema = new Schema({
  lists,
  todos,
});

export type Database = (typeof AppSchema)['types'];
export type ListRecord = Database['lists'];
export type TodoRecord = Database['todos'];
