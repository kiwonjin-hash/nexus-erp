import React, { useState, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import { InboundRecord, Product } from '../types';
import { Search, Save, Clock, PackageCheck } from 'lucide-react';

const Inbound: React.FC = () => {
  const [skuInput, setSkuInput] = useState('');
  const [quantityInput, setQuantityInput] = useState<number | ''>('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<InboundRecord[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await inventoryService.getInboundHistory();
    setHistory(data);
  };

  const handleSkuSearch = async (val: string) => {
    const formatted = val.toUpperCase();
    setSkuInput(formatted);
  
    if (formatted.length >= 4) {
      const product = await inventoryService.getProductBySku(formatted);
      setFoundProduct(product || null);
    } else {
      setFoundProduct(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundProduct || !quantityInput) return;

    const success = await inventoryService.addInbound(
      foundProduct.sku,
      Number(quantityInput),
      'Admin User'
    );

    if (success) {
      setFeedback(`+${quantityInput} ${foundProduct.name} 입고 완료`);
      setSkuInput('');
      setQuantityInput('');
      setFoundProduct(null);

      await loadHistory();

      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-8rem)]">

      {/* 왼쪽: 입고 등록 */}
      <div className="lg:col-span-1">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PackageCheck className="text-amber-600" />
            입고 등록
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                SKU 코드
              </label>

              <div className="relative">
                <input
                  type="text"
                  value={skuInput}
                  onChange={(e) => handleSkuSearch(e.target.value)}
                  placeholder="Scan or type SKU..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none uppercase font-mono"
                  autoFocus
                />
                <Search className="absolute right-3 top-3.5 text-slate-400" size={18} />
              </div>

              {skuInput && !foundProduct && (
                <p className="text-xs text-red-500 mt-2">
                  제품을 찾을 수 없습니다.
                </p>
              )}
            </div>

            {foundProduct && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                <p className="text-xs text-amber-800 font-semibold mb-1">
                  제품 확인됨
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {foundProduct.name}
                </p>
                <div className="text-xs text-slate-600 mt-2">
                  현재 재고: <b>{foundProduct.stock}</b>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                입고 수량
              </label>
              <input
                type="number"
                min="1"
                value={quantityInput}
                onChange={(e) => setQuantityInput(Number(e.target.value))}
                disabled={!foundProduct}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={!foundProduct || !quantityInput}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
            >
              <Save size={18} />
              입고 완료 처리
            </button>
          </form>

          {feedback && (
            <div className="mt-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 text-center">
              {feedback}
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 입고 이력 */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        <div className="p-6 border-b border-slate-200 flex items-center gap-2">
          <Clock size={18} className="text-slate-400" />
          <h3 className="font-bold text-slate-800">
            최근 입고 이력
          </h3>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left">날짜</th>
                <th className="px-6 py-3 text-left">SKU</th>
                <th className="px-6 py-3 text-left">수량</th>
                <th className="px-6 py-3 text-left">작업자</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((record) => (
                <tr key={record.id}>
                  <td className="px-6 py-4">
                    {record.createdAt?.seconds
                      ? new Date(record.createdAt.seconds * 1000).toLocaleString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 font-mono">
                    {record.sku}
                  </td>
                  <td className="px-6 py-4 font-bold text-green-600">
                    +{record.quantity}
                  </td>
                  <td className="px-6 py-4">
                    {record.operator}
                  </td>
                </tr>
              ))}

              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-400">
                    아직 입고 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default Inbound;