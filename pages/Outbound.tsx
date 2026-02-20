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

          setIsCameraOpen(false);
          html5QrCode.stop();

          processTrackingSearch(cleaned); // 🔥 React 방식 직접 실행
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

  const processTrackingSearch = async (tracking: string) => {
    setErrorMsg(null);

    if (!tracking.trim()) return;

    const q = query(
      collection(db, "orders"),
      where("trackingNumber", "==", tracking.trim())
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
      orderData.items.map((item: any) => ({
        sku: item.sku,
        name: item.name || item.sku,
        requiredQty: item.qty,
        scannedQty: 0
      }))
    );

    setTrackingInput("");
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
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Calculate Progress
  const totalRequired = itemsState.reduce((acc, curr) => acc + curr.requiredQty, 0);
  const totalScanned = itemsState.reduce((acc, curr) => acc + curr.scannedQty, 0);
  const progressPercent = totalRequired > 0 ? Math.min(100, (totalScanned / totalRequired) * 100) : 0;

  return (
    <div className="h-full flex flex-col gap-6">
      
      {/* 1. Top Section: Tracking Input */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[160px]">
        {!activeOrder ? (
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
        ) : (
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                <Truck size={28} />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Processing Order</p>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{activeOrder.tracking}</h2>
                <p className="text-xs text-slate-400 mt-1">Customer: {activeOrder.customerName} | ID: {activeOrder.id}</p>
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