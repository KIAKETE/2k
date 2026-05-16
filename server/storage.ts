import { randomUUID } from 'crypto';
import type { Simulation, InsertSimulation } from '../shared/schema.js';
import { calculateAccruedInterest } from '../shared/bonds.js';

// ============================
// IN-MEMORY MODELS
// ============================

interface Broker {
  id: string;
  name: string;
  stockBrokerage: string; // % as string
  bondBrokerage:  string;
}

interface OrderBookItem {
  id: string;
  tradingCode:     string;
  isin:            string;
  securityType:    string;
  couponRate?:     string;
  issueDate?:      string;
  maturityDate?:   string;
  vnuaDividends?:  string;
  sellPrice?:      string;
  buyPrice?:       string;
  cleanPrice?:     string;
  dirtyPrice?:     string;
  accruedInterest?: string;
}

interface Asset {
  id: string;
  symbol: string;
  name: string;
}

interface PortfolioHolding {
  id: string;
  userId: string;
  orderBookId?: string;
  brokerId: string;
  isin?: string;
  tradingCode?: string;
  couponRate?: string;
  issueDate?: Date | null;
  maturityDate?: Date | null;
  quantity: string;
  averagePrice: string;
  totalAmount: string;
  cleanPrice?: string;
  dirtyPrice?: string;
  accruedInterest?: string;
  yieldToMaturity?: string;
  liquidityStatus?: string | null;
  lastYieldUpdate?: string | null;
  createdAt: Date;
}

// ============================
// STORAGE
// ============================

class MemoryStorage {
  private brokers     = new Map<string, Broker>();
  private orderBook   = new Map<string, OrderBookItem>();
  private assets      = new Map<string, Asset>();
  private portfolio   = new Map<string, PortfolioHolding>();
  private simulations = new Map<string, Simulation>();

  constructor() {
    this.seed();
  }

  // ── Brokers ──
  async getAllBrokers(): Promise<Broker[]>            { return Array.from(this.brokers.values()); }
  async getBroker(id: string): Promise<Broker | null> { return this.brokers.get(id) ?? null; }

  // ── Order Book ──
  async getAllOrderBook(): Promise<OrderBookItem[]>           { return Array.from(this.orderBook.values()); }
  async getOrderBook(id: string): Promise<OrderBookItem|null> { return this.orderBook.get(id) ?? null; }

  // ── Assets ──
  async getAllAssets(): Promise<Asset[]>          { return Array.from(this.assets.values()); }
  async getAsset(id: string): Promise<Asset|null> { return this.assets.get(id) ?? null; }
  async updateAssetYields(_id: string, _y: any): Promise<void> { /* no-op in demo */ }

  // ── Portfolio ──
  async getPortfolio(userId: string): Promise<PortfolioHolding[]> {
    return Array.from(this.portfolio.values()).filter(h => h.userId === userId);
  }

  async createPortfolioHolding(data: Partial<PortfolioHolding> & { userId: string }): Promise<PortfolioHolding> {
    const id = randomUUID();
    const holding: PortfolioHolding = {
      id,
      userId:       data.userId,
      orderBookId:  data.orderBookId,
      brokerId:     data.brokerId ?? '',
      isin:         data.isin,
      tradingCode:  data.tradingCode,
      couponRate:   data.couponRate,
      issueDate:    data.issueDate ?? null,
      maturityDate: data.maturityDate ?? null,
      quantity:     data.quantity ?? '0',
      averagePrice: data.averagePrice ?? '0',
      totalAmount:  data.totalAmount ?? '0',
      cleanPrice:   data.cleanPrice,
      dirtyPrice:   data.dirtyPrice,
      accruedInterest: data.accruedInterest,
      yieldToMaturity: data.yieldToMaturity,
      liquidityStatus: data.liquidityStatus ?? null,
      lastYieldUpdate: data.lastYieldUpdate ?? null,
      createdAt:    new Date(),
    };
    this.portfolio.set(id, holding);
    return holding;
  }

  async updatePortfolioHolding(id: string, op: { operation: string; quantity: string }): Promise<PortfolioHolding | null> {
    const holding = this.portfolio.get(id);
    if (!holding) return null;
    if (op.operation === 'sell') {
      const remaining = parseFloat(holding.quantity) - parseFloat(op.quantity);
      if (remaining <= 0) this.portfolio.delete(id);
      else { holding.quantity = remaining.toString(); this.portfolio.set(id, holding); }
    }
    return holding;
  }

  // ── Simulations ──
  async getUserSimulations(userId: string): Promise<Simulation[]> {
    return Array.from(this.simulations.values()).filter(s => s.userId === userId);
  }

  async createSimulation(data: InsertSimulation): Promise<Simulation> {
    const id = randomUUID();
    const simulation: Simulation = {
      id,
      userId:      data.userId,
      assetId:     data.assetId      ?? null,
      orderBookId: data.orderBookId  ?? null,
      brokerId:    data.brokerId,
      type:        data.type,
      quantity:    data.quantity,
      price:       data.price,
      totalAmount: data.totalAmount,
      fees:        data.fees,
      orderType:   data.orderType,
      createdAt:   new Date(),
    };
    this.simulations.set(id, simulation);
    return simulation;
  }

  // ── Dashboard ──
  async getDashboardSummary(userId: string) {
    const holdings = await this.getPortfolio(userId);
    const totalInvested = holdings.reduce((sum, h) => sum + parseFloat(h.totalAmount), 0);
    return {
      totalHoldings: holdings.length,
      totalInvested,
    };
  }

  // ============================
  // SEED — mock data
  // ============================
  private seed() {
    // Brokers
    const brokers: Broker[] = [
      { id: 'br-lwei',  name: 'Lwei Brokers',     stockBrokerage: '0.75', bondBrokerage: '0.50' },
      { id: 'br-bfa',   name: 'BFA Investimentos', stockBrokerage: '1.00', bondBrokerage: '0.60' },
      { id: 'br-bai',   name: 'BAI Capital',       stockBrokerage: '0.85', bondBrokerage: '0.45' },
    ];
    brokers.forEach(b => this.brokers.set(b.id, b));

    // Order book — mix of OT-NR (100k nominal), OT-ME (1k nominal) and a stock
    const now = new Date();
    const issueDate     = new Date(now.getFullYear() - 1, 5, 15);   // 1y ago
    const maturityDate1 = new Date(now.getFullYear() + 4, 5, 15);   // 4y out
    const maturityDate2 = new Date(now.getFullYear() + 2, 1, 28);   // 2y out

    const buildBond = (code: string, type: string, nominal: number, couponPct: number, cleanPct: number, maturity: Date, isin: string): OrderBookItem => {
      const accruedRes = calculateAccruedInterest(
        { couponRate: couponPct, nominalValue: nominal, issueDate, maturityDate: maturity, couponFrequency: 2 },
        now,
      );
      const cleanPrice = nominal * (cleanPct / 100);
      const dirtyPrice = cleanPrice + accruedRes.accruedInterest;
      return {
        id: code.toLowerCase(),
        tradingCode:    code,
        isin,
        securityType:   type,
        couponRate:     couponPct.toString(),
        issueDate:      issueDate.toISOString(),
        maturityDate:   maturity.toISOString(),
        vnuaDividends:  nominal.toString(),
        sellPrice:      cleanPrice.toFixed(2),
        cleanPrice:     cleanPrice.toFixed(2),
        accruedInterest: accruedRes.accruedInterest.toFixed(2),
        dirtyPrice:     dirtyPrice.toFixed(2),
      };
    };

    const orderBook: OrderBookItem[] = [
      buildBond('OI15F30A', 'OT-ME', 1000,   7.50, 103.47, maturityDate1, 'AOEEI15F30A0'),
      buildBond('OM20J27B', 'OT-NR', 100000, 12.00, 99.85, maturityDate2, 'AOEEM20J27B1'),
      buildBond('OL18M29A', 'OT-NR', 100000,  8.25, 101.20, maturityDate1, 'AOEEL18M29A2'),
      buildBond('EI10D26A', 'Eurobond', 10000, 9.50, 104.10, maturityDate2, 'AOEEI10D26A3'),
      // Stock example
      {
        id: 'bai-stock',
        tradingCode:  'BAIA',
        isin:         'AOBAIA000003',
        securityType: 'Acção',
        sellPrice:    '15500.00',
        buyPrice:     '15400.00',
      },
    ];
    orderBook.forEach(o => this.orderBook.set(o.id, o));

    // Assets (lightweight mirror, used for asset enrichment in simulations endpoint)
    orderBook.forEach(o => {
      this.assets.set(o.id, { id: o.id, symbol: o.tradingCode, name: o.securityType });
    });
  }
}

export const storage = new MemoryStorage();
