import { inventoryService } from "../services/inventoryService";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import React, { useState, useRef, useEffect } from 'react';
import { Order, OrderItem } from '../types';
import { 
  Scan, 
  CheckCircle2, 
  AlertCircle, 
  Minus, 
  Plus, 
  Box, 
  Truck,
  ArrowRight
} from 'lucide-react';

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const Outbound: React.FC = () => {
  const [trackingInput, setTrackingInput] = useState('');
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [itemsState, setItemsState] = useState<OrderItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [deliveryMode, setDeliveryMode] = useState<"NORMAL" | "VALEX" | "PICKUP">("NORMAL");
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const cameraRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  
  // Ref for the hidden barcode scanner input that keeps focus
  const scanInputRef = useRef<HTMLInputElement>(null);
  const startCamera = async () => {
    if (!cameraRef.current) return;

    const html5QrCode = new Html5Qrcode("reader");
    html5QrCodeRef.current = html5QrCode;

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 300, height: 150 }, // 가로형 바코드 최적화
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        },
        (decodedText) => {
          const cleaned = decodedText.replace(/\D/g, "");

          setTrackingInput(cleaned); // 🔥 input 값 세팅
          setIsCameraOpen(false);
          html5QrCode.stop();
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera start failed:", err);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      await html5QrCodeRef.current.stop();
      html5QrCodeRef.current = null;
    }
    setIsCameraOpen(false);
  };


  useEffect(() => {
    // Auto-focus on scan input when an order is active
    if (activeOrder && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [activeOrder]);

  useEffect(() => {
    const cleaned = trackingInput.replace(/\D/g, "");

    if (cleaned.length === 13 && !isSearching) {
      setIsSearching(true);
      processTrackingSearch(cleaned).finally(() => {
        setIsSearching(false);
      });
    }
  }, [trackingInput]);

  const processTrackingSearch = async (tracking: string) => {
    setErrorMsg(null);

    if (!tracking.trim()) return;

    const q = query(
      collection(db, "orders"),
      where("tracking", "==", tracking.trim()),
      where("deliveryType", "==", "POST"),
      where("status", "==", "READY")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      setErrorMsg("주문 정보를 찾을 수 없습니다.");
      setActiveOrder(null);
      return;
    }

    const docSnap = snapshot.docs[0];
    const orderData = { id: docSnap.id, ...docSnap.data() } as Order;

    if (orderData.status === "COMPLETED") {
      setErrorMsg("이미 출고 완료된 주문입니다.");
      setActiveOrder(null);
      return;
    }

    setActiveOrder(orderData);

    setItemsState(
      orderData.items.map((item: any) => {
        const resolvedSku =
          item.sku ||
          item.productSku ||
          item.id ||
          item.code ||
          "";

        return {
          sku: resolvedSku,
          name: item.name || resolvedSku,
          requiredQty: item.qty,
          scannedQty: 0
        };
      })
    );
  };

  const loadValexOrders = async () => {
    try {
      const q = query(
        collection(db, "orders"),
        where("deliveryType", "==", "VALEX"),
        where("status", "==", "READY")
      );

      const snapshot = await getDocs(q);

      const valexOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setPendingOrders(valexOrders);
    } catch (err) {
      console.error("발렉스 주문 로딩 실패:", err);
    }
  };

  const loadPickupOrders = async () => {
    try {
      const q = query(
        collection(db, "orders"),
        where("deliveryType", "==", "PICKUP"),
        where("status", "==", "READY")
      );

      const snapshot = await getDocs(q);

      const pickupOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setPendingOrders(pickupOrders);
    } catch (err) {
      console.error("방문수령 주문 로딩 실패:", err);
    }
  };

  const handleTrackingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await processTrackingSearch(trackingInput);
  };

  const handleProductScan = (sku: string) => {
    const idx = itemsState.findIndex(i => i.sku === sku);
    if (idx !== -1) {
      const newItems = [...itemsState];
      newItems[idx].scannedQty += 1;
      setItemsState(newItems);
      // Play success sound (conceptually)
    } else {
      // Handle wrong item scan
      setErrorMsg(`SKU ${sku} 는 이 주문에 포함되지 않은 상품입니다.`);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const updateQuantity = (sku: string, delta: number) => {
    setItemsState(prev => prev.map(item => {
      if (item.sku === sku) {
        const newQty = Math.max(0, item.scannedQty + delta);
        return { ...item, scannedQty: newQty };
      }
      return item;
    }));
  };

  const setManualQuantity = (sku: string, qty: number) => {
    setItemsState(prev => prev.map(item => {
      if (item.sku === sku) {
        return { ...item, scannedQty: Math.max(0, qty) };
      }
      return item;
    }));
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // This assumes the barcode scanner acts as keyboard input followed by Enter
    // We capture the value from a hidden or visible input for "Product Scan"
    if (scanInputRef.current) {
        const value = scanInputRef.current.value.trim();
        if(value) {
            handleProductScan(value);
            scanInputRef.current.value = ''; // Clear for next scan
        }
    }
  };

  const isOrderComplete = itemsState.every(i => i.scannedQty === i.requiredQty);
  
  const handleFinalize = async () => {
    if (!activeOrder || !isOrderComplete) return;

    const success = await inventoryService.completeOrder(
      activeOrder.id,   // 👈 여기 바꿔라
      itemsState.map(i => ({ sku: i.sku, qty: i.scannedQty }))
    );

    if (success) {
      setSuccessMsg(`주문 ${activeOrder.tracking} 출고 처리가 완료되었습니다.`);
      setActiveOrder(null);
      setItemsState([]);
      setTrackingInput(""); // 🔥 출고 완료 후 운송장 입력값 초기화

      // 🔥 배송 모드에 따라 리스트 새로고침
      if (deliveryMode === "VALEX") {
        loadValexOrders();
      } else if (deliveryMode === "PICKUP") {
        loadPickupOrders();
      }

      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Calculate Progress
  const totalRequired = itemsState.reduce((acc, curr) => acc + curr.requiredQty, 0);
  const totalScanned = itemsState.reduce((acc, curr) => acc + curr.scannedQty, 0);
  const progressPercent = totalRequired > 0 ? Math.min(100, (totalScanned / totalRequired) * 100) : 0;

  // Derived variables for searching and pagination
  const filteredOrders = pendingOrders.filter((order) => {
    const keyword = orderSearch.toLowerCase();
    return (
      (order.name && order.name.toLowerCase().includes(keyword)) ||
      (order.receiver && order.receiver.toLowerCase().includes(keyword)) ||
      (order.order_no && String(order.order_no).includes(keyword)) ||
      (order.phone && String(order.phone).includes(keyword))
    );
  });

  const totalPages = Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="h-full flex flex-col gap-6">

      {/* Delivery Mode Selector */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setDeliveryMode("NORMAL");
            setActiveOrder(null);
            setItemsState([]);
            setPendingOrders([]);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            deliveryMode === "NORMAL"
              ? "bg-amber-500 text-white"
              : "bg-slate-200 text-slate-700"
          }`}
        >
          우체국
        </button>

        <button
          onClick={() => {
            setDeliveryMode("VALEX");
            setActiveOrder(null);
            setItemsState([]);
            loadValexOrders();
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            deliveryMode === "VALEX"
              ? "bg-amber-500 text-white"
              : "bg-slate-200 text-slate-700"
          }`}
        >
          발렉스 (천만원 이상)
        </button>

        <button
          onClick={() => {
            setDeliveryMode("PICKUP");
            setActiveOrder(null);
            setItemsState([]);
            loadPickupOrders();
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            deliveryMode === "PICKUP"
              ? "bg-amber-500 text-white"
              : "bg-slate-200 text-slate-700"
          }`}
        >
          방문수령
        </button>
      </div>
      
      {/* 1. Top Section: Tracking Input */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[160px] relative">
        {successMsg && (
          <div className="absolute top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-lg shadow text-sm font-medium">
            {successMsg}
          </div>
        )}
        {!activeOrder && deliveryMode === "NORMAL" ? (
          <div className="w-full max-w-xl text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">운송장 스캔</h2>
            <p className="text-slate-500 mb-6">바코드 스캐너를 사용하여 운송장을 스캔하세요.</p>
            <form id="tracking-form" onSubmit={handleTrackingSearch} className="relative">
              <Scan className="absolute left-4 top-4 text-slate-400" />
              <input 
                type="text" 
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Tracking Number..."
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 outline-none text-lg font-mono tracking-wider transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setIsCameraOpen(true);
                  setTimeout(() => startCamera(), 300);
                }}
                className="absolute right-4 top-3 bg-amber-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-amber-600"
              >
                📷
              </button>
            </form>
            {isCameraOpen && (
              <div className="mt-6">
                <div id="reader" ref={cameraRef} className="w-full max-w-md mx-auto rounded-lg overflow-hidden border" />
                <button
                  onClick={stopCamera}
                  className="mt-3 text-sm text-red-500 underline"
                >
                  카메라 닫기
                </button>
              </div>
            )}
            {errorMsg && <p className="text-red-500 mt-3 font-medium animate-pulse">{errorMsg}</p>}
            {successMsg && <p className="text-green-600 mt-3 font-medium flex items-center justify-center gap-2"><CheckCircle2/> {successMsg}</p>}
          </div>
        ) : !activeOrder && (deliveryMode === "VALEX" || deliveryMode === "PICKUP") ? (
          <div className="w-full max-w-2xl mx-auto space-y-3">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              {deliveryMode === "VALEX" ? "발렉스 출고 대기 주문" : "방문수령 대기 주문"}
            </h2>

            <div className="mb-4">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="이름 / 주문번호 / 연락처 검색"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {filteredOrders.length === 0 && (
              <div className="text-slate-500 text-sm">
                출고 대기 주문이 없습니다.
              </div>
            )}

            {paginatedOrders.map((order: any) => (
              <div
                key={order.id}
                onClick={() => {
                  setActiveOrder(order);
                  setItemsState(
                    order.items.map((item: any) => {
                      const resolvedSku =
                        item.sku ||
                        item.productSku ||
                        item.id ||
                        item.code ||
                        "";

                      return {
                        sku: resolvedSku,
                        name: item.name || resolvedSku,
                        requiredQty: item.qty,
                        scannedQty: 0
                      };
                    })
                  );
                }}
                className="p-4 border rounded-lg cursor-pointer hover:bg-amber-50 transition"
              >
                <div className="font-semibold text-slate-800">
                  {order.name ?? order.receiver ?? "고객"}
                </div>
                <div className="text-sm text-slate-500">
                  주문번호: {order.order_no}
                </div>
                <div className="text-sm font-mono text-slate-700">
                  {order.total_price?.toLocaleString()}원
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-4 flex-wrap pb-2 text-sm">
                {/* 이전 버튼 */}
                {currentPage > 1 && (
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className="px-2 py-1 text-slate-600 hover:text-black"
                  >
                    ◀ 이전
                  </button>
                )}

                {(() => {
                  const pages: (number | string)[] = [];

                  const start = Math.max(1, currentPage - 2);
                  const end = Math.min(totalPages, currentPage + 2);

                  if (start > 1) {
                    pages.push(1);
                    if (start > 2) pages.push("...");
                  }

                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }

                  if (end < totalPages) {
                    if (end < totalPages - 1) pages.push("...");
                    pages.push(totalPages);
                  }

                  return pages.map((page, idx) =>
                    page === "..." ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">
                        ...
                      </span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page as number)}
                        className={`px-3 py-1 ${
                          currentPage === page
                            ? "border-b-2 border-black font-semibold text-black"
                            : "text-slate-600 hover:text-black"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  );
                })()}

                {/* 다음 버튼 */}
                {currentPage < totalPages && (
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    className="px-2 py-1 text-slate-600 hover:text-black"
                  >
                    다음 ▶
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                <Truck size={28} />
              </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500 font-medium">
                Processing Order
              </p>

              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {activeOrder.tracking}
              </h2>

              <div className="text-sm text-slate-600 mt-2 space-y-1">
                <div>
                  <span className="font-semibold text-slate-800">주문자:</span>{" "}
                  {(activeOrder as any).name ?? (activeOrder as any).receiver ?? "-"}
                </div>

                <div>
                  <span className="font-semibold text-slate-800">연락처:</span>{" "}
                  {(activeOrder as any).phone || "-"}
                </div>

                <div>
                  <span className="font-semibold text-slate-800">배송지:</span>{" "}
                  {(activeOrder as any).address || "-"}
                </div>

                <div>
                  <span className="font-semibold text-slate-800">주문번호:</span>{" "}
                  {activeOrder.id}
                </div>
              </div>
            </div>
            </div>
            
            {/* Progress Bar */}
            <div className="flex-1 max-w-md mx-12">
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-slate-600">Scanning Progress</span>
                <span className={isOrderComplete ? 'text-green-600' : 'text-slate-900'}>
                  {totalScanned} / {totalRequired} Items
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${isOrderComplete ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <button 
              onClick={() => setActiveOrder(null)} 
              className="text-slate-400 hover:text-red-500 text-sm font-medium underline px-4"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Workspace: Scanning List */}
      {activeOrder && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
          
          {/* List Section */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <Box size={18} className="text-slate-500" />
              <span className="font-semibold text-slate-700">Products to Pack</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {itemsState.map((item) => {
                const isComplete = item.scannedQty === item.requiredQty;
                const isOver = item.scannedQty > item.requiredQty;
                
                let rowClass = "border border-slate-200 bg-white";
                if (isComplete) rowClass = "border-green-200 bg-green-50/50";
                if (isOver) rowClass = "border-red-200 bg-red-50";

                return (
                  <div key={item.sku} className={`p-4 rounded-lg flex items-center justify-between transition-all ${rowClass}`}>
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-2 h-12 rounded-full ${isComplete ? 'bg-green-500' : isOver ? 'bg-red-500' : 'bg-slate-300'}`}></div>

                      {/* Product Image */}
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-slate-100 flex items-center justify-center border">
                        {(item as any).image ? (
                          <img
                            src={(item as any).image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">NO IMG</span>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 text-lg">{item.name}</h4>
                          {isComplete && <CheckCircle2 size={18} className="text-green-600" />}
                          {isOver && <AlertCircle size={18} className="text-red-600" />}
                        </div>
                        <p className="text-sm font-mono text-slate-500">{item.sku}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block uppercase font-bold tracking-wider">Required</span>
                        <span className="text-xl font-bold text-slate-700">{item.requiredQty}</span>
                      </div>

                      <div className="h-10 w-px bg-slate-200"></div>

                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => updateQuantity(item.sku, -1)}
                          className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100 text-slate-500"
                        >
                          <Minus size={16} />
                        </button>
                        
                        <div className="flex flex-col items-center w-16">
                           <input 
                              type="number" 
                              value={item.scannedQty}
                              onChange={(e) => setManualQuantity(item.sku, parseInt(e.target.value) || 0)}
                              className={`w-16 text-center text-2xl font-bold bg-transparent outline-none ${isOver ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-amber-600'}`}
                           />
                           <span className="text-[10px] text-slate-400">SCANNED</span>
                        </div>

                        <button 
                          onClick={() => updateQuantity(item.sku, 1)}
                          className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100 text-slate-500"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Hidden Input for Barcode Scanner Listener */}
            <form onSubmit={handleBarcodeSubmit} className="opacity-0 h-0 w-0 overflow-hidden">
                <input ref={scanInputRef} type="text" autoFocus autoComplete="off" />
                <button type="submit">Scan</button>
            </form>
          </div>

          {/* Action Panel */}
          <div className="lg:col-span-1 space-y-4">
             <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col justify-between h-full">
                <div>
                  <h3 className="font-bold text-lg mb-2">검수 현황</h3>
                  <div className="space-y-4 mt-6">
                    <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                        <span className="text-slate-400">Total Items</span>
                        <span className="font-mono text-xl">{totalRequired}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                        <span className="text-slate-400">Scanned</span>
                        <span className="font-mono text-xl text-amber-400">{totalScanned}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">Pending</span>
                        <span className="font-mono text-xl">{Math.max(0, totalRequired - totalScanned)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  {errorMsg && (
                    <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-lg mb-4 text-sm text-red-200">
                        {errorMsg}
                    </div>
                  )}
                  
                  <button
                    onClick={handleFinalize}
                    disabled={!isOrderComplete}
                    className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-xl
                      ${isOrderComplete 
                        ? 'bg-green-500 hover:bg-green-600 text-white cursor-pointer' 
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'}`}
                  >
                    <span>출고 완료 처리</span>
                    <ArrowRight size={20} />
                  </button>
                  <p className="text-center text-xs text-slate-500 mt-3">
                    모든 수량이 일치해야 완료할 수 있습니다.
                  </p>
                </div>
             </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default Outbound;