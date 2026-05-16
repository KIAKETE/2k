import {
  calculateAccruedInterest as calculateAccruedInterestShared,
  BondData as SharedBondData,
  validateBondData,
} from '../shared/bonds.js';

// ============================
// INTERFACES
// ============================

export interface BondData {
  nominalValue:     number;
  couponRate:       number;
  issueDate:        Date;
  maturityDate:     Date;
  currentPrice:     number;
  priceDate:        Date;
  lastCouponDate?:  Date;
  nextCouponDate?:  Date;
  couponFrequency?: number;
}

export interface CalculatedYields {
  ytm:              number;
  currentYield:     number;
  modifiedDuration: number;
  convexity:        number;
  accruedInterest:  number;
  dirtyPrice:       number;
}

// ============================
// CALCULATOR
// ============================

export class BondYieldCalculator {
  static calculateHistoricalYields(bondData: BondData): CalculatedYields {
    const { nominalValue, couponRate, maturityDate, currentPrice, priceDate } = bondData;

    const yearsToMaturity      = this.calculateYearsToMaturity(priceDate, maturityDate);
    const couponsRemaining     = Math.max(1, Math.ceil(yearsToMaturity * 2));
    const semiAnnualCouponRate = couponRate / 200;
    const semiAnnualCouponAmount = nominalValue * semiAnnualCouponRate;
    const cleanPrice           = nominalValue * (currentPrice / 100);

    const sharedBondData: SharedBondData = {
      couponRate:      bondData.couponRate,
      nominalValue:    bondData.nominalValue,
      issueDate:       bondData.issueDate,
      maturityDate:    bondData.maturityDate,
      lastCouponDate:  bondData.lastCouponDate,
      nextCouponDate:  bondData.nextCouponDate,
      couponFrequency: bondData.couponFrequency || 2,
    };

    const accruedResult   = calculateAccruedInterestShared(sharedBondData, priceDate);
    const accruedInterest = accruedResult.accruedInterest;
    const dirtyPrice      = cleanPrice + accruedInterest;

    console.log('💰 Cálculo de Juros Corridos:', {
      cleanPrice:          `${cleanPrice.toFixed(2)} Kz`,
      daysSinceLastCoupon: accruedResult.daysSinceLastCoupon,
      daysInPeriod:        accruedResult.daysInCouponPeriod,
      accruedFraction:     `${(accruedResult.accruedFraction * 100).toFixed(2)}%`,
      accruedInterest:     `${accruedInterest.toFixed(2)} Kz`,
      dirtyPrice:          `${dirtyPrice.toFixed(2)} Kz`,
    });

    const annualCouponAmount = nominalValue * (couponRate / 100);
    const currentYield       = (annualCouponAmount / cleanPrice) * 100;

    const ytm = this.calculateYTM({
      cleanPrice, nominalValue, semiAnnualCouponAmount, couponsRemaining, yearsToMaturity,
    });

    const modifiedDuration = this.calculateModifiedDuration({
      nominalValue, semiAnnualCouponAmount, couponsRemaining, ytm: ytm / 100,
    });

    const convexity = this.calculateConvexity({
      nominalValue, semiAnnualCouponAmount, couponsRemaining, ytm: ytm / 100, cleanPrice,
    });

    return { ytm, currentYield, modifiedDuration, convexity, accruedInterest, dirtyPrice };
  }

  // Newton-Raphson YTM
  private static calculateYTM(params: {
    cleanPrice: number;
    nominalValue: number;
    semiAnnualCouponAmount: number;
    couponsRemaining: number;
    yearsToMaturity: number;
  }): number {
    const { cleanPrice, nominalValue, semiAnnualCouponAmount, couponsRemaining } = params;

    let ytmGuess = 0.05;
    const tolerance     = 0.000001;
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      const semiAnnualYTM = ytmGuess / 2;
      let presentValue = 0;
      let duration     = 0;

      for (let period = 1; period <= couponsRemaining; period++) {
        const discountFactor = Math.pow(1 + semiAnnualYTM, -period);
        const couponPV       = semiAnnualCouponAmount * discountFactor;
        presentValue += couponPV;
        duration     += (period / 2) * couponPV;
      }

      const principalPV = nominalValue * Math.pow(1 + semiAnnualYTM, -couponsRemaining);
      presentValue += principalPV;
      duration     += (couponsRemaining / 2) * principalPV;

      const priceDifference = presentValue - cleanPrice;
      if (Math.abs(priceDifference) < tolerance) return ytmGuess * 100;

      const derivative = -duration / (1 + semiAnnualYTM);
      if (Math.abs(derivative) > 0.000001) {
        ytmGuess = ytmGuess - priceDifference / derivative;
      } else {
        break;
      }

      ytmGuess = Math.max(-0.2, Math.min(1.0, ytmGuess));
    }

    return ytmGuess * 100;
  }

  // Modified Duration
  private static calculateModifiedDuration(params: {
    nominalValue: number;
    semiAnnualCouponAmount: number;
    couponsRemaining: number;
    ytm: number;
  }): number {
    const { nominalValue, semiAnnualCouponAmount, couponsRemaining, ytm } = params;
    const semiAnnualYTM = ytm / 2;

    let weightedDuration = 0;
    let presentValue     = 0;

    for (let period = 1; period <= couponsRemaining; period++) {
      const discountFactor = Math.pow(1 + semiAnnualYTM, -period);
      const couponPV       = semiAnnualCouponAmount * discountFactor;
      weightedDuration += (period / 2) * couponPV;
      presentValue     += couponPV;
    }

    const principalPV = nominalValue * Math.pow(1 + semiAnnualYTM, -couponsRemaining);
    weightedDuration += (couponsRemaining / 2) * principalPV;
    presentValue     += principalPV;

    const macaulayDuration = weightedDuration / presentValue;
    return macaulayDuration / (1 + semiAnnualYTM);
  }

  // Convexity
  private static calculateConvexity(params: {
    nominalValue: number;
    semiAnnualCouponAmount: number;
    couponsRemaining: number;
    ytm: number;
    cleanPrice: number;
  }): number {
    const { nominalValue, semiAnnualCouponAmount, couponsRemaining, ytm, cleanPrice } = params;
    const semiAnnualYTM      = ytm / 2;
    const discountFactorBase = 1 + semiAnnualYTM;

    let convexity = 0;

    for (let period = 1; period <= couponsRemaining; period++) {
      const t              = period / 2;
      const discountFactor = Math.pow(discountFactorBase, -period);
      convexity += (semiAnnualCouponAmount * discountFactor) * t * (t + 0.5);
    }

    const pt = couponsRemaining / 2;
    convexity += (nominalValue * Math.pow(discountFactorBase, -couponsRemaining)) * pt * (pt + 0.5);

    return convexity / (cleanPrice * Math.pow(discountFactorBase, 2));
  }

  private static calculateYearsToMaturity(fromDate: Date, maturityDate: Date): number {
    return Math.max(
      0,
      (maturityDate.getTime() - fromDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
  }
}

// ============================
// CONVENIENCE FUNCTION
// ============================

export function calculateHistoricalBondYields(
  instrument:      any,
  historicalPrice: number,
  priceDate:       Date
): CalculatedYields | null {
  try {
    const isBond =
      instrument.securityType?.toLowerCase().includes('ot-') ||
      instrument.securityType?.toLowerCase().includes('obriga');

    if (!isBond || !instrument.couponRate || !instrument.maturityDate) return null;

    const bondData: BondData = {
      nominalValue:    parseFloat(instrument.vnuaDividends) || 1000,
      couponRate:      parseFloat(instrument.couponRate),
      issueDate:       instrument.issueDate ? new Date(instrument.issueDate) : new Date(),
      maturityDate:    new Date(instrument.maturityDate),
      currentPrice:    historicalPrice,
      priceDate,
      lastCouponDate:  instrument.lastCouponDate  ? new Date(instrument.lastCouponDate)  : undefined,
      nextCouponDate:  instrument.nextCouponDate  ? new Date(instrument.nextCouponDate)  : undefined,
      couponFrequency: instrument.couponFrequency ? parseInt(instrument.couponFrequency) : 2,
    };

    const validation = validateBondData({
      couponRate:      bondData.couponRate,
      nominalValue:    bondData.nominalValue,
      issueDate:       bondData.issueDate,
      maturityDate:    bondData.maturityDate,
      lastCouponDate:  bondData.lastCouponDate,
      nextCouponDate:  bondData.nextCouponDate,
      couponFrequency: bondData.couponFrequency,
    });

    if (!validation.isValid) {
      console.warn('Dados inválidos:', validation.warnings);
      return null;
    }

    return BondYieldCalculator.calculateHistoricalYields(bondData);
  } catch (error) {
    console.error('Erro calculando yields históricos:', error);
    return null;
  }
}
