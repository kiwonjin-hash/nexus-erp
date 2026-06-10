import React, { useState, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import { Product } from '../types';
import { Search, Filter, ArrowUpDown, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import Papa from "papaparse";

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // 🗑 다중 선택 상태
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);

  // 🔥 제품 추가 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newStock, setNewStock] = useState(0);

  // 아임웹 동기화 / 대조 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<any[] | null>(null);

  // ✏️ 제품 수정 상태
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStock, setEditStock] = useState(0);
  const [editImage, setEditImage] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editImwebProdNo, setEditImwebProdNo] = useState('');

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
      sku: newSku.trim().toUpperCase(),
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

  // 🗑 제품 삭제
  const handleDeleteProduct = async (sku: string) => {
    const confirmDelete = window.confirm("정말 이 제품을 삭제하시겠습니까?");
    if (!confirmDelete) return;

    await inventoryService.deleteProduct(sku.trim().toUpperCase());
    await loadProducts();
  };

  // 🗑 선택 상품 일괄 삭제
  const handleDeleteSelected = async () => {
    if (selectedSkus.length === 0) {
      alert("삭제할 상품을 선택하세요.");
      return;
    }

    const confirmDelete = window.confirm(
      `선택된 ${selectedSkus.length}개 상품을 삭제하시겠습니까?`
    );
    if (!confirmDelete) return;

    await inventoryService.deleteMultipleProducts(selectedSkus);
    setSelectedSkus([]);
    await loadProducts();
  };

  // ✏️ 제품 수정 저장
  const handleUpdateProduct = async () => {
    if (!editingProduct) return;

    const originalSku = editingProduct.sku.trim().toUpperCase();

    await inventoryService.updateProduct(originalSku, {
      name: editName,
      category: editCategory,
      stock: editStock,
      image: editImage,
      link: editLink
    });

    if (editImwebProdNo !== ((editingProduct as any).imwebProdNo || '')) {
      await inventoryService.updateImwebProdNo(originalSku, editImwebProdNo);
    }

    setEditingProduct(null);
    await loadProducts();
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
            sku: row.sku.trim().toUpperCase(),
            name: row.name.trim(),
            category: row.category || "",
            stock: Number(row.stock) || 0,
            link: row.link || row.image || ""
          });
        }

        await loadProducts();
        alert("CSV 업로드 완료");
      }
    });
  };

  // 아임웹 상품 동기화
  const handleImwebSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await inventoryService.syncFromImweb();
      setSyncResult(`동기화 완료: ${result.synced}개 상품 업데이트 (전체 ${result.total}개)`);
    } catch (e: any) {
      setSyncResult(`오류: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // 아임웹 재고 대조
  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const result = await inventoryService.reconcileWithImweb();
      setReconcileResult(result.discrepancies ?? []);
    } catch (e: any) {
      alert(`대조 오류: ${e.message}`);
    } finally {
      setReconciling(false);
    }
  };

  // 📤 CSV 다운로드
  const handleCSVDownload = () => {
    const data = products.map(p => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      stock: p.stock,
      image: (p as any).image || "",
      link: (p as any).link || ""
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
            onClick={handleImwebSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:bg-indigo-300"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "동기화 중..." : "아임웹 동기화"}
          </button>

          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:bg-orange-300"
          >
            <AlertTriangle size={16} />
            {reconciling ? "대조 중..." : "재고 대조"}
          </button>

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

          <button
            onClick={handleDeleteSelected}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
            선택 삭제
          </button>
        </div>
      </div>

      {/* 동기화 결과 */}
      {syncResult && (
        <div className={`px-6 py-3 text-sm border-b ${syncResult.startsWith('오류') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
          {syncResult}
        </div>
      )}

      {/* 재고 대조 결과 */}
      {reconcileResult !== null && (
        <div className="p-4 border-b border-slate-200 bg-orange-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-orange-600" />
            <span className="font-semibold text-orange-800 text-sm">
              재고 대조 결과 — 차이 발생 항목: {reconcileResult.length}개
            </span>
            <button onClick={() => setReconcileResult(null)} className="ml-auto text-xs text-slate-400 hover:text-slate-600">닫기</button>
          </div>
          {reconcileResult.length === 0 ? (
            <p className="text-sm text-green-700">모든 항목이 일치합니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-orange-200">
                    <th className="pb-2 pr-4">상품명</th>
                    <th className="pb-2 pr-4">아임웹 재고</th>
                    <th className="pb-2 pr-4">ERP 재고</th>
                    <th className="pb-2 pr-4">차이</th>
                    <th className="pb-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {reconcileResult.map((item) => (
                    <tr key={item.prod_no} className="border-b border-orange-100">
                      <td className="py-1.5 pr-4 font-medium text-slate-800">{item.name}</td>
                      <td className="py-1.5 pr-4">{item.imweb_stock}</td>
                      <td className="py-1.5 pr-4">{item.erp_stock}</td>
                      <td className={`py-1.5 pr-4 font-bold ${item.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.diff > 0 ? `+${item.diff}` : item.diff}
                      </td>
                      <td className="py-1.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          item.status === 'ERP_EXCESS' ? 'bg-green-100 text-green-700' :
                          item.status === 'IMWEB_EXCESS' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {item.status === 'ERP_EXCESS' ? 'ERP 초과' :
                           item.status === 'IMWEB_EXCESS' ? '아임웹 초과' : item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
              <th className="px-4 py-4 border-b">
                <input
                  type="checkbox"
                  checked={
                    filteredProducts.length > 0 &&
                    selectedSkus.length === filteredProducts.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSkus(filteredProducts.map(p => p.sku));
                    } else {
                      setSelectedSkus([]);
                    }
                  }}
                />
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">SKU</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">제품명</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">카테고리</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b">아임웹 상품번호</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">현재 재고</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">상태</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">마지막 업데이트</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-500 border-b text-right">관리</th>
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
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedSkus.includes(product.sku)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSkus(prev => [...prev, product.sku]);
                        } else {
                          setSelectedSkus(prev => prev.filter(sku => sku !== product.sku));
                        }
                      }}
                    />
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-600 font-medium">
                    {product.sku}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {(product as any).link ? (
                      <a
                        href={(product as any).link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {product.name}
                      </a>
                    ) : (
                      product.name
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {(product as any).imwebProdNo ? (
                      <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                        {(product as any).imwebProdNo}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">미연결</span>
                    )}
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
                  <td className="px-6 py-4 text-sm text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setEditSku(product.sku);
                          setEditName(product.name);
                          setEditCategory(product.category || '');
                          setEditStock(product.stock || 0);
                          setEditImage((product as any).image || '');
                          setEditLink((product as any).link || '');
                          setEditImwebProdNo((product as any).imwebProdNo || '');
                        }}
                        className="px-3 py-1 bg-slate-800 text-white rounded text-xs hover:bg-slate-900"
                      >
                        수정
                      </button>

                      <button
                        onClick={() => handleDeleteProduct(product.sku)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
                        삭제
                      </button>
                    </div>
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

      {/* ✏️ 제품 수정 모달 */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold">제품 수정</h3>

            <input
              type="text"
              value={editSku}
              readOnly
              className="w-full border rounded px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
            />

            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="제품명"
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <input
              type="text"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              placeholder="카테고리"
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <input
              type="number"
              value={editStock}
              onChange={(e) => setEditStock(Number(e.target.value))}
              placeholder="재고"
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <input
              type="text"
              value={editImage}
              onChange={(e) => setEditImage(e.target.value)}
              placeholder="이미지 URL"
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <input
              type="text"
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              placeholder="제품 링크 URL"
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">아임웹 상품번호</label>
              <input
                type="text"
                value={editImwebProdNo}
                onChange={(e) => setEditImwebProdNo(e.target.value)}
                placeholder="예: 12345678 (아임웹 prod_no)"
                className="w-full border rounded px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">입력하면 아임웹 주문 수신 시 이 SKU로 자동 매칭됩니다.</p>
            </div>

            {editImage && (
              <img
                src={editImage}
                alt="preview"
                className="w-24 h-24 object-cover rounded border"
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 bg-slate-300 rounded text-sm"
              >
                취소
              </button>

              <button
                onClick={handleUpdateProduct}
                className="px-4 py-2 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;