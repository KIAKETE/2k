import { db } from './db.js';
import { eq } from 'drizzle-orm';
import { simulations, type Simulation, type InsertSimulation } from '../shared/schema.js';

export class DatabaseStorage {
  async getAllSimulations(): Promise<Simulation[]> {
    return await db.select().from(simulations);
  }

  async getSimulationsByUser(userId: string): Promise<Simulation[]> {
    return await db
      .select()
      .from(simulations)
      .where(eq(simulations.userId, userId));
  }

  async getSimulation(id: string): Promise<Simulation | undefined> {
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, id));
    return simulation;
  }

  async createSimulation(insertSimulation: InsertSimulation): Promise<Simulation> {
    const [simulation] = await db
      .insert(simulations)
      .values(insertSimulation)
      .returning();
    return simulation;
  }

  async deleteSimulation(id: string): Promise<boolean> {
    const result = await db
      .delete(simulations)
      .where(eq(simulations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Alias
  async getUserSimulations(userId: string): Promise<Simulation[]> {
    return this.getSimulationsByUser(userId);
  }
}
