// ============================
// INTERFACES
// ============================

export interface BondData {
  couponRate:       number;
  nominalValue:     number;
  issueDate?:       Date;
  maturityDate?:    Date;
  lastCouponDate?:  Date;
  nextCouponDate?:  Date;
  couponFrequency?: number;
}

export interface AccruedInterestResult {
  accruedInterest:     number;
  daysSinceLastCoupon: number;
  daysInCouponPeriod:  number;
  accruedFraction:     number;
  lastCouponDate:      Date;
  nextCouponDate:      Date;
}

// ============================
// DATE UTILITIES
// ============================

export function daysBetween(startDate: Date, endDate: Date): number {
  const diffTime = endDate.getTime() - startDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function calculateNextCouponDate(lastCouponDate: Date, frequency: number): Date {
  const monthsToAdd = 12 / frequency;
  const nextDate = new Date(lastCouponDate);
  nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
  return nextDate;
}

export function calculateLastCouponDate(
  issueDate:   Date,
  currentDate: Date,
  frequency:   number = 2
): Date {
  const monthsBetweenCoupons = 12 / frequency;
  let lastCouponDate = new Date(issueDate);

  while (lastCouponDate <= currentDate) {
    const nextCoupon = new Date(lastCouponDate);
    nextCoupon.setMonth(nextCoupon.getMonth() + monthsBetweenCoupons);
    if (nextCoupon > currentDate) break;
    lastCouponDate = nextCoupon;
  }

  return lastCouponDate;
}

// ============================
// COUPON DATE ESTIMATION
// ============================

export function estimateCouponDates(
  bondData:    BondData,
  currentDate: Date = new Date()
): { lastCouponDate: Date; nextCouponDate: Date } {
  const frequency = bondData.couponFrequency || 2;

  if (bondData.lastCouponDate) {
    const lastCouponDate = new Date(bondData.lastCouponDate);
    const nextCouponDate = bondData.nextCouponDate
      ? new Date(bondData.nextCouponDate)
      : calculateNextCouponDate(lastCouponDate, frequency);
    return { lastCouponDate, nextCouponDate };
  }

  if (bondData.issueDate) {
    const lastCouponDate = calculateLastCouponDate(
      new Date(bondData.issueDate), currentDate, frequency
    );
    const nextCouponDate = calculateNextCouponDate(lastCouponDate, frequency);
    return { lastCouponDate, nextCouponDate };
  }

  // Fallback: assume mid-period
  const estimatedLastCoupon = new Date(currentDate);
  estimatedLastCoupon.setMonth(estimatedLastCoupon.getMonth() - 6 / frequency);
  const estimatedNextCoupon = calculateNextCouponDate(estimatedLastCoupon, frequency);
  return { lastCouponDate: estimatedLastCoupon, nextCouponDate: estimatedNextCoupon };
}

// ============================
// ACCRUED INTEREST — ACT/ACT
// ============================

export function calculateAccruedInterest(
  bondData:    BondData,
  currentDate: Date = new Date()
): AccruedInterestResult {
  const frequency = bondData.couponFrequency || 2;
  const { lastCouponDate, nextCouponDate } = estimateCouponDates(bondData, currentDate);

  const daysSinceLastCoupon = daysBetween(lastCouponDate, currentDate);
  const daysInCouponPeriod  = daysBetween(lastCouponDate, nextCouponDate);
  const accruedFraction     = daysSinceLastCoupon / daysInCouponPeriod;
  const couponPerPeriod     = (bondData.couponRate / frequency / 100) * bondData.nominalValue;
  const accruedInterest     = couponPerPeriod * accruedFraction;

  return {
    accruedInterest,
    daysSinceLastCoupon,
    daysInCouponPeriod,
    accruedFraction,
    lastCouponDate,
    nextCouponDate,
  };
}

// ============================
// DIRTY PRICE
// ============================

export function calculateDirtyPrice(
  cleanPrice:  number,
  bondData:    BondData,
  currentDate: Date = new Date()
): { dirtyPrice: number; accruedInterest: AccruedInterestResult } {
  const accruedInterest = calculateAccruedInterest(bondData, currentDate);
  const dirtyPrice      = cleanPrice + accruedInterest.accruedInterest;
  return { dirtyPrice, accruedInterest };
}

// ============================
// NOMINAL VALUE BY BODIVA CODE
// ============================

export function determineNominalValue(tradingCode: string, vnuaDividends?: number): number {
  if (!tradingCode) return vnuaDividends || 100000;

  const code = tradingCode.toUpperCase().trim();

  // OT-NR: OL, OM, ON, OO → 100,000 Kz
  if (
    code.startsWith('OL') || code.startsWith('OM') ||
    code.startsWith('ON') || code.startsWith('OO')
  ) return 100000;

  // OT-ME: EL, OF, OG, OH, OI, OJ, OK → 1,000 Kz
  if (
    code.startsWith('EL') || code.startsWith('OF') ||
    code.startsWith('OG') || code.startsWith('OH') ||
    code.startsWith('OI') || code.startsWith('OJ') ||
    code.startsWith('OK')
  ) return 1000;

  // Eurobonds: EI → 10,000 Kz
  if (code.startsWith('EI')) return 10000;

  return vnuaDividends || 100000;
}

// ============================
// VALIDATION
// ============================

export function validateBondData(bondData: BondData): {
  isValid: boolean;
  hasAccurateDates: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let hasAccurateDates = true;

  if (!bondData.lastCouponDate && !bondData.issueDate) {
    warnings.push("Sem data de último cupão ou emissão — usando estimativa");
    hasAccurateDates = false;
  }

  if (!bondData.couponFrequency) {
    warnings.push("Frequência de cupão não especificada — assumindo semestral");
  }

  if (bondData.couponRate <= 0) {
    warnings.push("Taxa de cupão inválida");
    return { isValid: false, hasAccurateDates: false, warnings };
  }

  if (bondData.nominalValue <= 0) {
    warnings.push("Valor nominal inválido");
    return { isValid: false, hasAccurateDates: false, warnings };
  }

  return { isValid: true, hasAccurateDates, warnings };
}
