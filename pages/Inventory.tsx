import React, { useState, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import { Product } from '../types';
import { Search, Filter, ArrowUpDown, Plus } from 'lucide-react';
import Papa from "papaparse";

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // 🔥 제품 추가 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newStock, setNewStock] = useState(0);

  // 🔹 데이터 로드
  const loadProducts = async () => {
    const data = await inventoryService.getProducts();
    setProducts(data);
    setFilteredProducts(data);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // 🔹 검색 필터
  useEffect(() => {
    const filtered = products.filter(p => {
      const name = p.name ?? "";
      const sku = p.sku ?? "";

      return (
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

    setFilteredProducts(filtered);
  }, [searchTerm, products]);

  // 🔥 제품 추가
  const handleAddProduct = async () => {
    if (!newSku || !newName) {
      alert("SKU와 제품명을 입력하세요.");
      return;
    }

    await inventoryService.createProduct({
      sku: newSku,
      name: newName,
      category: newCategory,
      stock: newStock
    });

    await loadProducts();

    // 초기화
    setNewSku('');
    setNewName('');
    setNewCategory('');
    setNewStock(0);
    setShowAddForm(false);
  };

  // 📥 CSV 업로드
  const handleCSVUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        for (const row of results.data) {
          if (!row.sku || !row.name) continue;

          await inventoryService.createProduct({
            sku: row.sku.trim(),
            name: row.name.trim(),
            category: row.category || "",
            stock: Number(row.stock) || 0
          });
        }

        await loadProducts();
        alert("CSV 업로드 완료");
      }
    });
  };

  // 📤 CSV 다운로드
  const handleCSVDownload = () => {
    const data = products.map(p => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      stock: p.stock
    }));

    const csv = Papa.unparse(data);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "inventory_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">

      {/* Toolbar */}
      <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">재고 현황</h2>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="SKU 또는 제품명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
            />
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
          >
            <Plus size={16} />
            제품 추가
          </button>

          <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 cursor-pointer">
            CSV 업로드
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={handleCSVDownload}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
          >
            CSV 다운로드
          </button>
        </div>
      </div>

      {/* 🔥 제품 추가 폼 */}
      {showAddForm && (
        <div className="p-6 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-5 gap-4">
          <input
            type="text"
            placeholder="SKU"
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="제품명"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="카테고리"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="초기 재고"
            value={newStock}
            onChange={(e) => setNewStock(Number(e.target.value))}
            className="border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddProduct}
            className="bg-blue-500 text-white rounded px-4 py-2 text-sm hover:bg-blue-600"
          >
            등록
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">SKU</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">제품명</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">카테고리</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">현재 재고</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">상태</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">마지막 업데이트</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map((product) => {
              const stock = product.stock ?? 0;
              const isLowStock = stock <= 10;

              let lastUpdated = "-";
              if ((product as any).lastUpdated?.seconds) {
                lastUpdated = new Date(
                  (product as any).lastUpdated.seconds * 1000
                ).toLocaleString();
              }

              return (
                <tr key={product.sku} className="hover:bg-amber-50/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-slate-600 font-medium">
                    {product.sku}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {product.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-slate-800">
                    {stock.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    {isLowStock ? (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        재고 부족
                      </span>
                    ) : (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        정상
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 text-right">
                    {lastUpdated}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between">
        <span>Showing {filteredProducts.length} items</span>
        <span>Page 1 of 1</span>
      </div>

    </div>
  );
};

export default Inventory;