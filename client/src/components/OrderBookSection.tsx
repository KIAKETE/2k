import { useQuery } from '@tanstack/react-query';

interface OrderBookSectionProps {
  onInstrumentSelect: (instrument: any) => void;
}

export default function OrderBookSection({ onInstrumentSelect }: OrderBookSectionProps) {
  const { data: orderBook, isLoading } = useQuery<any[]>({
    queryKey: ['/api/order-book'],
  });

  return (
    <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">InvestHub — Simulador</h1>
      <p className="text-sm text-gray-600 mb-6">
        Clica num instrumento abaixo para o auto-preencher no painel de simulação.
      </p>

      <h2 className="text-lg font-semibold text-gray-800 mb-3">Livro de Ordens</h2>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">A carregar...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Código', 'Tipo', 'Cupão', 'Preço Limpo', 'Dirty Price', ''].map((col) => (
                  <th key={col} className="text-left px-4 py-3 font-medium text-gray-600">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orderBook?.map((item) => {
                const isBond =
                  item.securityType?.toLowerCase().includes('ot-') ||
                  item.securityType?.toLowerCase().includes('obriga') ||
                  item.securityType?.toLowerCase().includes('eurobond');

                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">
                      {item.tradingCode}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {item.securityType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.couponRate ? `${parseFloat(item.couponRate).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.cleanPrice
                        ? parseFloat(item.cleanPrice).toLocaleString('pt-AO', {
                            style: 'currency',
                            currency: 'AOA',
                          })
                        : item.sellPrice
                          ? parseFloat(item.sellPrice).toLocaleString('pt-AO', {
                              style: 'currency',
                              currency: 'AOA',
                            })
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.dirtyPrice
                        ? parseFloat(item.dirtyPrice).toLocaleString('pt-AO', {
                            style: 'currency',
                            currency: 'AOA',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onInstrumentSelect(item)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                      >
                        {isBond ? 'Comprar' : 'Negociar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
