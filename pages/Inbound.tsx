import React, { useState, useEffect, useRef } from 'react';
import { inventoryService } from '../services/inventoryService';
import { InboundRecord } from '../types';
import { Search, Save, Clock, PackageCheck } from 'lucide-react';

const Inbound: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ prod_no: string; name: string; stock?: number } | null>(null);
  const [quantityInput, setQuantityInput] = useState<number | ''>('');
  const [history, setHistory] = useState<InboundRecord[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory();
    loadCatalog();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const items = await inventoryService.getProductCatalog();
      setCatalogItems(items);
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadHistory = async () => {
    const data = await inventoryService.getInboundHistory();
    setHistory(data);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    setSelectedProduct(null);

    if (val.trim().length === 0) {
      setFilteredItems([]);
      setShowDropdown(false);
      return;
    }

    const lower = val.toLowerCase();
    const matches = catalogItems
      .filter(p => (p.name || '').toLowerCase().includes(lower) || (p.code || '').toLowerCase().includes(lower))
      .slice(0, 10);
    setFilteredItems(matches);
    setShowDropdown(matches.length > 0);
  };

  const handleSelectProduct = async (item: any) => {
    setSearchInput(item.name);
    setShowDropdown(false);

    // inventory 문서 가져오거나 없으면 자동 생성
    const inv = await inventoryService.getOrCreateInventoryItem(item.prod_no, { name: item.name });
    setSelectedProduct({ prod_no: item.prod_no, name: item.name, stock: (inv as any).stock ?? 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !quantityInput) return;

    const success = await inventoryService.addInbound(
      selectedProduct.prod_no,
      Number(quantityInput),
      'Admin User'
    );

    if (success) {
      setFeedback(`+${quantityInput} ${selectedProduct.name} 입고 완료`);
      setSearchInput('');
      setQuantityInput('');
      setSelectedProduct(null);
      await loadHistory();
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const totalPages = Math.ceil(history.length / pageSize);
  const paginatedHistory = history.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full min-h-0">

      {/* 왼쪽: 입고 등록 */}
      <div className="lg:col-span-1">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PackageCheck className="text-amber-600" />
            입고 등록
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div ref={dropdownRef} className="relative">
              <label className="block text-sm font-medium text-slate-600 mb-2">
                상품 검색
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchInput && filteredItems.length > 0 && setShowDropdown(true)}
                  placeholder={catalogLoading ? "상품 목록 로딩 중..." : "상품명으로 검색..."}
                  disabled={catalogLoading}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100"
                  autoFocus
                />
                <Search className="absolute right-3 top-3.5 text-slate-400" size={18} />
              </div>

              {showDropdown && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredItems.map((item) => (
                    <li
                      key={item.prod_no}
                      onClick={() => handleSelectProduct(item)}
                      className="px-4 py-2.5 hover:bg-amber-50 cursor-pointer text-sm border-b border-slate-100 last:border-0"
                    >
                      <span className="font-medium text-slate-800">{item.name}</span>
                      {item.code && (
                        <span className="ml-2 text-xs text-slate-400">{item.code}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {searchInput && !selectedProduct && filteredItems.length === 0 && !showDropdown && !catalogLoading && (
                <p className="text-xs text-slate-500 mt-2">
                  검색 결과가 없습니다. 재고 페이지에서 아임웹 동기화 후 다시 시도하세요.
                </p>
              )}
            </div>

            {selectedProduct && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                <p className="text-xs text-amber-800 font-semibold mb-1">
                  상품 확인됨
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {selectedProduct.name}
                </p>
                <div className="text-xs text-slate-600 mt-2">
                  현재 재고: <b>{selectedProduct.stock ?? 0}</b>
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
                disabled={!selectedProduct}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={!selectedProduct || !quantityInput}
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
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0">

        <div className="p-6 border-b border-slate-200 flex items-center gap-2">
          <Clock size={18} className="text-slate-400" />
          <h3 className="font-bold text-slate-800">
            최근 입고 이력
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left">날짜</th>
                <th className="px-6 py-3 text-left">상품</th>
                <th className="px-6 py-3 text-left">수량</th>
                <th className="px-6 py-3 text-left">작업자</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedHistory.map((record) => (
                <tr key={record.id}>
                  <td className="px-6 py-4">
                    {(record as any).createdAt?.seconds
                      ? new Date((record as any).createdAt.seconds * 1000).toLocaleString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
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

        {totalPages > 1 && (
          <div className="p-4 border-t flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`px-3 py-1 rounded text-sm font-semibold ${
                  page === i + 1
                    ? "bg-amber-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default Inbound;
