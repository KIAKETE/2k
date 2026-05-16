import type { Express, Request, Response } from 'express';
import { storage } from './storage.js';
import { insertSimulationSchema } from '../shared/schema.js';
import { calculateHistoricalBondYields } from './bond-yield-calculator.js';
import { requireAuth, getCurrentUserId } from './auth.js';

export function registerRoutes(app: Express) {
  // ─────────────────────────────────────
  // GET /api/simulations
  // ─────────────────────────────────────
  app.get('/api/simulations', requireAuth, async (req: Request, res: Response) => {
    const userId = getCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    try {
      const userSimulations = await storage.getUserSimulations(userId);

      const enrichedSimulations = await Promise.all(
        userSimulations.map(async (simulation) => {
          const asset     = simulation.assetId     ? await storage.getAsset(simulation.assetId)         : null;
          const broker    = simulation.brokerId    ? await storage.getBroker(simulation.brokerId)       : null;
          const orderBook = simulation.orderBookId ? await storage.getOrderBook(simulation.orderBookId) : null;
          return { ...simulation, asset, broker, orderBook };
        })
      );

      enrichedSimulations.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json(enrichedSimulations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch simulations' });
    }
  });

  // ─────────────────────────────────────
  // POST /api/simulations
  // ─────────────────────────────────────
  app.post('/api/simulations', requireAuth, async (req: Request, res: Response) => {
    const userId = getCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    try {
      const validatedData = insertSimulationSchema.parse({ ...req.body, userId });
      const simulation    = await storage.createSimulation(validatedData);

      if (simulation.type === 'buy' && simulation.assetId) {
        try {
          const assets = await storage.getAllAssets();
          const asset  = assets.find((a: any) => a.id === simulation.assetId);
          if (asset && simulation.price) {
            await calculateAndStoreYields(asset, parseFloat(simulation.price));
          }
        } catch (yieldError) {
          console.error('Erro ao calcular yields:', yieldError);
        }
      }

      res.status(201).json(simulation);
    } catch (error) {
      res.status(400).json({ error: 'Invalid simulation data' });
    }
  });

  // ─────────────────────────────────────
  // POST /api/bonds/calculate-yields
  // ─────────────────────────────────────
  app.post('/api/bonds/calculate-yields', async (req: Request, res: Response) => {
    try {
      const { assetId, price } = req.body;

      if (!assetId || !price) {
        return res.status(400).json({ error: 'Asset ID e preço são obrigatórios' });
      }

      const orderBookItems = await storage.getAllOrderBook();
      const orderBookItem  = orderBookItems.find((item: any) => item.id === assetId);

      if (!orderBookItem) {
        return res.status(404).json({ error: 'Obrigação não encontrada no order book' });
      }

      const yields = calculateHistoricalBondYields(
        orderBookItem,
        parseFloat(price),
        new Date()
      );

      if (!yields) {
        return res.status(500).json({ error: 'Erro calculando yields' });
      }

      res.json({
        assetId,
        bondName:       orderBookItem.securityType || 'Obrigação',
        symbol:         orderBookItem.tradingCode  || orderBookItem.isin,
        simulatedPrice: parseFloat(price),
        orderBookData: {
          couponRate:   orderBookItem.couponRate,
          maturityDate: orderBookItem.maturityDate,
          nominalValue: orderBookItem.vnuaDividends || '100',
        },
        yields,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Helper — store yields after a buy simulation
async function calculateAndStoreYields(asset: any, price: number): Promise<void> {
  const yields = calculateHistoricalBondYields(asset, price, new Date());
  if (yields) {
    await storage.updateAssetYields?.(asset.id, yields);
  }
}
