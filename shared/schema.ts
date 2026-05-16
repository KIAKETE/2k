import { pgTable, varchar, text, decimal, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const simulations = pgTable("simulations", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:      varchar("user_id").notNull(),
  assetId:     varchar("asset_id"),
  orderBookId: varchar("order_book_id"),
  brokerId:    varchar("broker_id").notNull(),
  type:        text("type").notNull(),
  quantity:    decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  price:       decimal("price", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  fees:        decimal("fees", { precision: 10, scale: 2 }).notNull(),
  orderType:   text("order_type").notNull(),
  createdAt:   timestamp("created_at").defaultNow(),
});

export const insertSimulationSchema = createInsertSchema(simulations).omit({
  id: true,
  createdAt: true,
});

export type Simulation       = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
