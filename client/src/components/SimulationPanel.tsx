import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// ============================
// TYPES
// ============================

interface SimulationPanelProps {
  orderBook:            any[];
  brokers:              any[];
  portfolio:            any[];
  selectedInstrument:   any | null;
  onInstrumentDeselect: (() => void) | undefined;
}

// ============================
// HELPERS
// ============================

function getBondNominalValue(instrument: any): number {
  const code = instrument?.tradingCode?.toUpperCase() || '';

  if (/^O[L-O]/.test(code))  return 100000;  // OT-NR
  if (/^O[F-K]/.test(code))  return 1000;    // OT-ME
  if (code.startsWith('EL')) return 1000;
  if (code.startsWith('EI')) return 10000;   // Eurobond

  const vnua = parseFloat(instrument?.vnuaDividends || '0');
  if (vnua === 1000 || vnua === 10000 || vnua === 100000) return vnua;

  return 100000;
}

function isInstrumentBond(instrument: any): boolean {
  const type = instrument?.securityType?.toLowerCase() || '';
  return (
    type.includes('obrigação') ||
    type.includes('ot-') ||
    type.includes('bt-')
  );
}

// ============================
// COMPONENT
// ============================

export default function SimulationPanel({
  orderBook,
  brokers,
  portfolio,
  selectedInstrument,
  onInstrumentDeselect,
}: SimulationPanelProps) {
  const [operationType,     setOperationType]     = useState<'buy' | 'sell'>('buy');
  const [selectedAsset,     setSelectedAsset]     = useState('');
  const [quantity,          setQuantity]          = useState('');
  const [investmentAmount,  setInvestmentAmount]  = useState('');
  const [price,             setPrice]             = useState('');
  const [selectedBroker,    setSelectedBroker]    = useState('');
  const [includeBODIVAFees, setIncludeBODIVAFees] = useState(false);
  const [priceType,         setPriceType]         = useState<'market' | 'limit'>('market');
  const [showYieldMetrics,  setShowYieldMetrics]  = useState(false);

  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const availableInstruments = orderBook;
  const selectedInstrumentData = availableInstruments?.find((o: any) => o.id === selectedAsset);
  const isBondSelected = selectedInstrumentData ? isInstrumentBond(selectedInstrumentData) : false;

  // ── Auto-fill when instrument selected from order book ──
  useEffect(() => {
    if (!selectedInstrument) return;

    setSelectedAsset(selectedInstrument.id);

    if (isInstrumentBond(selectedInstrument)) {
      setPriceType('market');
      const dirtyPrice = selectedInstrument.dirtyPrice
        ? parseFloat(selectedInstrument.dirtyPrice)
        : 0;
      if (dirtyPrice > 0) setPrice(dirtyPrice.toString());
      setQuantity('');
      setInvestmentAmount((prev) => prev || '1000000');
    } else {
      if (selectedInstrument.sellPrice) setPrice(selectedInstrument.sellPrice);
      setQuantity((prev) => prev || '100');
      setInvestmentAmount('');
    }
  }, [selectedInstrument]);

  // ── Auto-calculate quantity from investment amount (bonds) ──
  useEffect(() => {
    if (!isBondSelected || !investmentAmount || !price) return;
    const investment = parseFloat(investmentAmount);
    const bondPrice  = parseFloat(price);
    if (!isNaN(investment) && !isNaN(bondPrice) && bondPrice > 0) {
      setQuantity(Math.floor(investment / bondPrice).toString());
    }
  }, [isBondSelected, investmentAmount, price]);

  // ============================
  // CALCULATIONS
  // ============================

  const calculateBondDetails = () => {
    const instrument = availableInstruments?.find((o: any) => o.id === selectedAsset);
    if (!isBondSelected || !instrument) return null;

    const qty               = parseFloat(quantity)  || 0;
    const dirtyPricePerUnit = parseFloat(price)     || 0;
    const couponRate        = parseFloat(instrument.couponRate || '0');
    const nominalValue      = getBondNominalValue(instrument);

    const cleanPricePerUnit    = parseFloat(instrument.cleanPrice      || '0');
    const accruedInterestUnit  = parseFloat(instrument.accruedInterest || '0');

    const purchaseValue         = cleanPricePerUnit   * qty;
    const accruedInterestTotal  = accruedInterestUnit * qty;
    const realInvestment        = purchaseValue + accruedInterestTotal;

    const iacRate = (() => {
      if (!instrument.maturityDate) return 0.10;
      const yearsToMaturity =
        (new Date(instrument.maturityDate).getTime() - Date.now()) /
        (365.25 * 24 * 60 * 60 * 1000);
      return yearsToMaturity > 3 ? 0.05 : 0.10;
    })();

    const semiAnnualCouponBruto   = (couponRate / 2) * nominalValue / 100;
    const semiAnnualCouponLiquido = semiAnnualCouponBruto * (1 - iacRate);
    const semiAnnualCouponTotal   = semiAnnualCouponLiquido * qty;

    const remainingCoupons = (() => {
      if (!instrument.maturityDate) return 4;
      const today    = new Date();
      const maturity = new Date(instrument.maturityDate);
      const months   =
        (maturity.getFullYear() - today.getFullYear()) * 12 +
        (maturity.getMonth() - today.getMonth());
      return Math.max(1, Math.ceil(months / 6));
    })();

    const totalCoupons    = semiAnnualCouponTotal * remainingCoupons;
    const redemptionValue = nominalValue * qty;
    const totalReturn     = totalCoupons + redemptionValue;

    return {
      units:            qty,
      nominalValue,
      remainingCoupons,
      securityType:     instrument.securityType,
      cleanPricePerUnit,
      dirtyPricePerUnit,
      realInvestment,
      purchaseValue,
      accruedInterest:  accruedInterestTotal,
      semiAnnualCoupon: semiAnnualCouponTotal,
      semiAnnualCouponBruto: semiAnnualCouponBruto * qty,
      iacRate,
      iacAmount:        (semiAnnualCouponBruto * qty) - semiAnnualCouponTotal,
      annualCouponRate: couponRate,
      totalCoupons,
      redemptionValue,
      totalReturn,
    };
  };

  const calculateTotal = () => {
    const broker     = brokers?.find((b: any) => b.id === selectedBroker);
    const instrument = availableInstruments?.find((o: any) => o.id === selectedAsset);
    const qty         = parseFloat(quantity) || 0;
    const prc         = parseFloat(price)    || 0;
    const totalAmount = qty * prc;

    const isBond = instrument?.securityType?.toLowerCase().includes('obrigação') ||
      instrument?.securityType?.toLowerCase().includes('ot-') ||
      instrument?.tradingCode?.toLowerCase().startsWith('o');

    let commissionBase = totalAmount;
    if (isBond) {
      const bondDetails = calculateBondDetails();
      commissionBase    = bondDetails ? bondDetails.realInvestment : totalAmount;
    }

    const brokerage = isBond
      ? parseFloat(broker?.bondBrokerage  || '0')
      : parseFloat(broker?.stockBrokerage || '0');

    const brokerBaseFees = commissionBase * (brokerage / 100);
    let bodivaFees = 0, cevamFees = 0;

    if (includeBODIVAFees) {
      if (isBond) {
        bodivaFees = commissionBase * 0.000525;
        cevamFees  = commissionBase * 0.00026;
      } else {
        bodivaFees = totalAmount * 0.0015;
        cevamFees  = totalAmount * 0.00045;
      }
    }

    const allCommissions = brokerBaseFees + bodivaFees + cevamFees;
    const ivaFees        = allCommissions * 0.14;

    return {
      total:           totalAmount + allCommissions + ivaFees,
      fees:            allCommissions + ivaFees,
      brokerFees:      brokerBaseFees,
      bodivaFees,
      cevamFees,
      ivaFees,
      totalBODIVAFees: bodivaFees + cevamFees,
    };
  };

  // ============================
  // MUTATIONS
  // ============================

  const createSimulationMutation = useMutation({
    mutationFn: async (data: any) => apiRequest('POST', '/api/simulations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/simulations'] });
    },
  });

  const addToPortfolioMutation = useMutation({
    mutationFn: async (data: any) => apiRequest('POST', '/api/portfolio', data),
    onSuccess: () => {
      toast({ title: 'Investimento adicionado à carteira!' });
      queryClient.refetchQueries({ queryKey: ['/api/portfolio'] });
      queryClient.refetchQueries({ queryKey: ['/api/dashboard/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/simulations'] });
      setSelectedAsset('');
      setQuantity('');
      setPrice('');
      setSelectedBroker('');
      setPriceType('market');
      onInstrumentDeselect?.();
    },
  });

  const sellFromPortfolioMutation = useMutation({
    mutationFn: async ({ holdingId, quantity }: { holdingId: string; quantity: string }) =>
      apiRequest('PUT', `/api/portfolio/${holdingId}`, { operation: 'sell', quantity }),
    onSuccess: () => {
      toast({ title: 'Venda realizada com sucesso!' });
      queryClient.refetchQueries({ queryKey: ['/api/portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
    },
  });

  // ============================
  // SUBMIT
  // ============================

  const handleSimulation = () => {
    if (!selectedAsset || !quantity || !price || !selectedBroker) {
      toast({ title: 'Campos obrigatórios', variant: 'destructive' });
      return;
    }

    const instrument  = availableInstruments?.find((o: any) => o.id === selectedAsset);
    const qty         = parseFloat(quantity);
    const prc         = parseFloat(price);
    const buyTotal    = calculateTotal();
    const bondDetails = calculateBondDetails();
    const isBond      = instrument?.securityType?.toLowerCase().includes('obrigação');

    if (operationType === 'buy') {
      createSimulationMutation.mutate({
        orderBookId: selectedAsset,
        brokerId:    selectedBroker,
        type:        'buy',
        orderType:   priceType,
        quantity:    qty.toString(),
        price:       prc.toString(),
        totalAmount: (qty * prc).toString(),
        fees:        buyTotal.fees.toString(),
      });

      addToPortfolioMutation.mutate({
        orderBookId:     selectedAsset,
        brokerId:        selectedBroker,
        isin:            instrument?.isin,
        tradingCode:     instrument?.tradingCode,
        couponRate:      instrument?.couponRate,
        issueDate:       instrument?.issueDate    ? new Date(instrument.issueDate)    : null,
        maturityDate:    instrument?.maturityDate ? new Date(instrument.maturityDate) : null,
        quantity:        qty.toString(),
        averagePrice:    prc.toString(),
        totalAmount:     (qty * prc).toString(),
        cleanPrice:      bondDetails?.cleanPricePerUnit.toString(),
        dirtyPrice:      bondDetails?.dirtyPricePerUnit.toString(),
        accruedInterest: bondDetails?.accruedInterest.toString(),
        yieldToMaturity: instrument?.couponRate,
        liquidityStatus: isBond ? 'medium' : null,
        lastYieldUpdate: isBond ? new Date().toISOString() : null,
      });
    }
  };

  // ============================
  // RENDER
  // ============================

  const bondDetails = calculateBondDetails();
  const totals      = calculateTotal();

  return (
    <div className="simulation-panel p-6 bg-white rounded-xl shadow-sm space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Simulador de Investimento</h2>

      {/* Operation type */}
      <div className="flex gap-2">
        {(['buy', 'sell'] as const).map((op) => (
          <button
            key={op}
            onClick={() => setOperationType(op)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              operationType === op
                ? op === 'buy'
                  ? 'bg-green-600 text-white'
                  : 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {op === 'buy' ? 'Compra' : 'Venda'}
          </button>
        ))}
      </div>

      {/* Instrument */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Instrumento</label>
        <select
          value={selectedAsset}
          onChange={(e) => setSelectedAsset(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Selecionar instrumento...</option>
          {availableInstruments?.map((instrument: any) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.tradingCode} — {instrument.securityType}
            </option>
          ))}
        </select>
      </div>

      {/* Price */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Preço (Kz)</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Investment amount (bonds only) */}
      {isBondSelected && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Valor a Investir (Kz)
          </label>
          <input
            type="number"
            value={investmentAmount}
            onChange={(e) => setInvestmentAmount(e.target.value)}
            placeholder="1000000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Quantity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade (títulos)</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Order type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Ordem</label>
        <select
          value={priceType}
          onChange={(e) => setPriceType(e.target.value as 'market' | 'limit')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="market">Mercado</option>
          <option value="limit">Limite</option>
        </select>
      </div>

      {/* Broker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Corretora</label>
        <select
          value={selectedBroker}
          onChange={(e) => setSelectedBroker(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Selecionar corretora...</option>
          {brokers?.map((broker: any) => (
            <option key={broker.id} value={broker.id}>
              {broker.name}
            </option>
          ))}
        </select>
      </div>

      {/* BODIVA fees toggle */}
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
        <input
          type="checkbox"
          checked={includeBODIVAFees}
          onChange={(e) => setIncludeBODIVAFees(e.target.checked)}
          className="rounded"
        />
        Incluir taxas BODIVA / CEVAMA
      </label>

      {/* Bond details summary */}
      {bondDetails && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm space-y-1">
          <p className="font-medium text-blue-800 mb-2">Resumo da Obrigação</p>
          <Row label="Clean Price / título"  value={fmt(bondDetails.cleanPricePerUnit)} />
          <Row label="Dirty Price / título"  value={fmt(bondDetails.dirtyPricePerUnit)} />
          <Row label="Juros Corridos (total)" value={fmt(bondDetails.accruedInterest)} />
          <Row label="Valor de Compra"       value={fmt(bondDetails.purchaseValue)} />
          <Row label="Investimento Real"     value={fmt(bondDetails.realInvestment)} />
          <hr className="my-1 border-blue-200" />
          <Row label={`Taxa IAC (${(bondDetails.iacRate * 100).toFixed(0)}%)`} value={fmt(bondDetails.iacAmount)} />
          <Row label="Cupão Semestral Líq."  value={fmt(bondDetails.semiAnnualCoupon)} />
          <Row label="Cupões Restantes"      value={bondDetails.remainingCoupons.toString()} />
          <Row label="Total Cupões"          value={fmt(bondDetails.totalCoupons)} />
          <Row label="Valor de Reembolso"    value={fmt(bondDetails.redemptionValue)} />
          <Row label="Retorno Total"         value={fmt(bondDetails.totalReturn)} className="font-semibold" />
        </div>
      )}

      {/* Fee breakdown */}
      {(quantity && price && selectedBroker) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1">
          <p className="font-medium text-gray-800 mb-2">Comissões</p>
          <Row label="Corretora"    value={fmt(totals.brokerFees)} />
          {includeBODIVAFees && (
            <>
              <Row label="BODIVA"   value={fmt(totals.bodivaFees)} />
              <Row label="CEVAMA"   value={fmt(totals.cevamFees)} />
            </>
          )}
          <Row label="IVA (14%)"    value={fmt(totals.ivaFees)} />
          <hr className="my-1 border-gray-300" />
          <Row label="Total a Pagar" value={fmt(totals.total)} className="font-semibold" />
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSimulation}
        disabled={
          createSimulationMutation.isPending || addToPortfolioMutation.isPending
        }
        className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
          operationType === 'buy'
            ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
            : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
        }`}
      >
        {operationType === 'buy' ? 'Simular Compra' : 'Simular Venda'}
      </button>
    </div>
  );
}

// ── Small helper components ──

function Row({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function fmt(value: number): string {
  return value.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' });
}
