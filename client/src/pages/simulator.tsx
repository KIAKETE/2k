import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import SimulationPanel from '@/components/SimulationPanel';
import OrderBookSection from '@/components/OrderBookSection';

export default function SimulatorPage() {
  const [selectedInstrument, setSelectedInstrument] = useState<any>(null);
  const simulatorRef = useRef<HTMLDivElement>(null);

  const { data: assets      } = useQuery({ queryKey: ['/api/assets']      });
  const { data: brokers     } = useQuery({ queryKey: ['/api/brokers']     });
  const { data: portfolio   } = useQuery({ queryKey: ['/api/portfolio']   });
  const { data: orderBook   } = useQuery({ queryKey: ['/api/order-book']  });
  const { data: simulations } = useQuery({ queryKey: ['/api/simulations'] });

  const handleInstrumentSelect = (instrument: any) => {
    setSelectedInstrument(instrument);
    setTimeout(() => {
      simulatorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* ── Order Book ── */}
      <OrderBookSection onInstrumentSelect={handleInstrumentSelect} />

      {/* ── Simulation Panel ── */}
      <div ref={simulatorRef} className="max-w-2xl mx-auto px-4 py-8">
        <SimulationPanel
          orderBook={orderBook           || []}
          brokers={brokers               || []}
          portfolio={portfolio           || []}
          selectedInstrument={selectedInstrument}
          onInstrumentDeselect={() => setSelectedInstrument(null)}
        />
      </div>

      {/* ── History Table ── */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Histórico de Simulações</h2>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Data', 'Operação', 'Ativo', 'Quantidade', 'Preço Unit.', 'Total', 'Corretora'].map(
                  (col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 font-medium text-gray-600"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {((simulations as any[]) || []).slice(0, 10).map((sim: any) => {
                const unitPrice =
                  parseFloat(sim.quantity) > 0
                    ? parseFloat(sim.totalAmount) / parseFloat(sim.quantity)
                    : 0;

                return (
                  <tr key={sim.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(sim.createdAt).toLocaleDateString('pt-AO')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          sim.type === 'buy'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {sim.type === 'buy' ? 'Compra' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {sim.asset?.symbol || sim.orderBook?.tradingCode || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {parseFloat(sim.quantity).toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {unitPrice.toLocaleString('pt-AO', {
                        style:    'currency',
                        currency: 'AOA',
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {parseFloat(sim.totalAmount).toLocaleString('pt-AO', {
                        style:    'currency',
                        currency: 'AOA',
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {sim.broker?.name || 'N/A'}
                    </td>
                  </tr>
                );
              })}

              {!simulations || (simulations as any[]).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Nenhuma simulação registada
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
