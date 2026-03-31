import { inventoryService } from "../services/inventoryService";
import { doc, getDoc, collection, collectionGroup, query, where, getDocs } from "firebase/firestore";
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

const normalizePickupName = (value: string = "") =>
  String(value || "")
    .replace(/\s+/g, "")
    .trim();

const normalizePhoneDigits = (value: string = "") =>
  String(value || "")
    .replace(/\D/g, "")
    .trim();

const getPhoneLast4 = (value: string = "") => {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 4 ? digits.slice(-4) : "";
};

const getPickupOrderName = (order: any) =>
  order?.name || order?.receiver || "";

const getPickupOrderPhone = (order: any) =>
  order?.phone ||
  order?.customerPhone ||
  order?.buyerPhone ||
  order?.receiverPhone ||
  order?.tel ||
  order?.mobile ||
  "";

const getPickupCustomerKey = (order: any) => {
  const safeName = normalizePickupName(getPickupOrderName(order));
  const phoneLast4 = getPhoneLast4(getPickupOrderPhone(order));
  return [safeName, phoneLast4].filter(Boolean).join("_");
};

const Outbound: React.FC = () => {
  const [trackingInput, setTrackingInput] = useState('');
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [itemsState, setItemsState] = useState<OrderItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [memo, setMemo] = useState('');

  const [deliveryMode, setDeliveryMode] = useState<"NORMAL" | "VALEX" | "PICKUP">("NORMAL");
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [selectedPickupOrders, setSelectedPickupOrders] = useState<string[]>([]);
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

    const deliveryTypeFilter =
      deliveryMode === "NORMAL"
        ? "POST"
        : deliveryMode; // "VALEX" or "PICKUP"

    const normalizedTracking = tracking.replace(/\D/g, "").trim();

    try {
      const [arraySnapshot, legacySnapshot] = await Promise.all([
        getDocs(
          query(
            collectionGroup(db, "shipments"),
            where("trackingNumbers", "array-contains", normalizedTracking),
            where("deliveryType", "==", deliveryTypeFilter),
            where("status", "==", "READY")
          )
        ),
        getDocs(
          query(
            collectionGroup(db, "shipments"),
            where("tracking", "==", normalizedTracking),
            where("deliveryType", "==", deliveryTypeFilter),
            where("status", "==", "READY")
          )
        )
      ]);

      const docSnap = arraySnapshot.docs[0] || legacySnapshot.docs[0];

      if (!docSnap) {
        setErrorMsg("주문 정보를 찾을 수 없습니다.");
        setActiveOrder(null);
        return;
      }

      const shipmentData: any = docSnap.data();
      const orderRef = docSnap.ref.parent.parent;
      const orderId = orderRef ? orderRef.id : "";
      const orderDoc = orderRef ? await getDoc(orderRef) : null;
      const parentOrderData: any = orderDoc && orderDoc.exists() ? orderDoc.data() : {};

      const shipmentStatus = String(shipmentData?.status || "").trim().toUpperCase();
      const parentOrderStatus = String(parentOrderData?.status || "").trim().toUpperCase();

      const orderData = {
        id: orderId,
        ...shipmentData,
        ...parentOrderData
      } as Order;

      if (
        shipmentStatus === "COMPLETED" ||
        shipmentStatus === "MERGED" ||
        parentOrderStatus === "COMPLETED" ||
        parentOrderStatus === "MERGED" ||
        shipmentData?.isCompleted === true ||
        parentOrderData?.isCompleted === true ||
        shipmentData?.pickupReady === false ||
        parentOrderData?.pickupReady === false ||
        Boolean(parentOrderData?.mergedInto)
      ) {
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

          const normalizedSku = String(resolvedSku || "")
            .trim()
            .toUpperCase();

          return {
            sku: normalizedSku,
            name: item.name || normalizedSku,
            requiredQty: Number(item.qty ?? item.quantity ?? 0),
            scannedQty: 0,
            sourceOrderId: item.sourceOrderId || orderData.id
          };
        })
      );
    } catch (error) {
      console.error("운송장 조회 실패:", error);
      setErrorMsg("주문 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setActiveOrder(null);
    }
  };

  const loadValexOrders = async () => {
    try {
      const q = query(
        collectionGroup(db, "shipments"),
        where("deliveryType", "==", "VALEX"),
        where("status", "==", "READY")
      );

      const snapshot = await getDocs(q);

      const valexOrders = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const shipmentData: any = docSnap.data();
          const orderRef = docSnap.ref.parent.parent;

          if (!orderRef) return null;

          const orderDoc = await getDoc(orderRef);
          const orderData: any = orderDoc.exists() ? orderDoc.data() : {};

          const shipmentStatus = String(shipmentData?.status || "").trim().toUpperCase();
          const orderStatus = String(orderData?.status || "").trim().toUpperCase();
          const mergedInto = String(orderData?.mergedInto || shipmentData?.mergedInto || "").trim();

          if (shipmentStatus === "COMPLETED" || shipmentStatus === "MERGED") return null;
          if (orderStatus === "COMPLETED" || orderStatus === "MERGED") return null;
          if (orderData?.isCompleted === true) return null;
          if (shipmentData?.isCompleted === true) return null;
          if (mergedInto) return null;

          return {
            id: orderRef.id,
            ...shipmentData,
            ...orderData
          };
        })
      );

      const uniqueMap = new Map<string, any>();

      valexOrders.filter(Boolean).forEach((order: any) => {
        if (!uniqueMap.has(order.id)) {
          uniqueMap.set(order.id, order);
        }
      });

      const cleanedOrders = Array.from(uniqueMap.values()).filter((order: any) => {
        const status = String(order?.status || "").trim().toUpperCase();
        const mergedInto = String(order?.mergedInto || "").trim();
        if (status === "COMPLETED" || status === "MERGED") return false;
        if (order?.isCompleted === true) return false;
        if (mergedInto) return false;
        return true;
      });

      setPendingOrders(cleanedOrders);
    } catch (err) {
      console.error("발렉스 주문 로딩 실패:", err);
    }
  };

  const loadPickupOrders = async () => {
    try {
      const q = query(
        collectionGroup(db, "shipments"),
        where("deliveryType", "==", "PICKUP"),
        where("status", "==", "READY")
      );

      const snapshot = await getDocs(q);

      const pickupOrders = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const shipmentData: any = docSnap.data();
          const orderRef = docSnap.ref.parent.parent;

          if (!orderRef) return null;

          const orderDoc = await getDoc(orderRef);
          const orderData: any = orderDoc.exists() ? orderDoc.data() : {};

          const shipmentStatus = String(shipmentData?.status || "").trim().toUpperCase();
          const orderStatus = String(orderData?.status || "").trim().toUpperCase();
          const mergedInto = String(orderData?.mergedInto || shipmentData?.mergedInto || "").trim();

          // MERGED / COMPLETED 상태는 방문수령 대기 목록에서 제외
          if (shipmentStatus === "COMPLETED" || shipmentStatus === "MERGED") return null;
          if (orderStatus === "COMPLETED" || orderStatus === "MERGED") return null;
          if (orderData?.isCompleted === true) return null;
          if (shipmentData?.isCompleted === true) return null;
          if (orderData?.pickupReady === false) return null;
          if (shipmentData?.pickupReady === false) return null;
          if (mergedInto) return null;

          return {
            id: orderRef.id,
            ...shipmentData,
            ...orderData
          };
        })
      );

      const uniqueMap = new Map<string, any>();

      pickupOrders.filter(Boolean).forEach((order: any) => {
        if (!uniqueMap.has(order.id)) {
          uniqueMap.set(order.id, order);
        }
      });

      const cleanedOrders = Array.from(uniqueMap.values()).filter((order: any) => {
        const status = String(order?.status || "").trim().toUpperCase();
        const mergedInto = String(order?.mergedInto || "").trim();
        if (status === "COMPLETED" || status === "MERGED") return false;
        if (order?.isCompleted === true) return false;
        if (order?.pickupReady === false) return false;
        if (mergedInto) return false;
        return true;
      });

      setPendingOrders(cleanedOrders);
    } catch (err) {
      console.error("방문수령 주문 로딩 실패:", err);
    }
  };

  const handleTrackingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await processTrackingSearch(trackingInput);
  };

  const handleProductScan = (sku: string) => {
    const normalizedSku = String(sku || "")
      .trim()
      .toUpperCase();

    const idx = itemsState.findIndex(
      i =>
        String(i.sku || "").trim().toUpperCase() === normalizedSku &&
        i.scannedQty < i.requiredQty
    );

    if (idx !== -1) {
      const newItems = [...itemsState];
      if (newItems[idx].scannedQty < newItems[idx].requiredQty) {
        newItems[idx].scannedQty += 1;
        setItemsState(newItems);
      }
    } else {
      setErrorMsg(`SKU ${normalizedSku} 는 주문에 없거나 이미 모든 수량을 스캔했습니다.`);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    setItemsState(prev =>
      prev.map((item, i) => {
        if (i === index) {
          const newQty = Math.max(0, item.scannedQty + delta);
          return { ...item, scannedQty: newQty };
        }
        return item;
      })
    );
  };

  const setManualQuantity = (index: number, qty: number) => {
    setItemsState(prev =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, scannedQty: Math.max(0, qty) };
        }
        return item;
      })
    );
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

    const finalizedItems = itemsState.map((i, index) => {
      const normalizedSku = String(i.sku || "").trim().toUpperCase();
      const fallbackSku = `NO-SKU-${activeOrder.id}-${index + 1}`;

      return {
        sku: normalizedSku || fallbackSku,
        originalSku: normalizedSku,
        qty: Number(i.scannedQty || 0),
        name: i.name,
        sourceOrderId: (i as any).sourceOrderId
      };
    });

    const invalidItem = finalizedItems.find(item => item.qty <= 0);

    if (invalidItem) {
      console.error("출고 payload 오류", {
        orderId: activeOrder.id,
        invalidItem,
        finalizedItems
      });
      setErrorMsg("출고할 상품 수량이 올바르지 않습니다.");
      return;
    }

    console.log("출고 finalize payload", {
      orderId: activeOrder.id,
      finalizedItems,
      shipmentMeta: {
        deliveryType: (activeOrder as any).deliveryType,
        tracking: (activeOrder as any).tracking,
        trackingNumbers: (activeOrder as any).trackingNumbers
      }
    });

    const success = await inventoryService.completeOrder(
      activeOrder.id,
      finalizedItems,
      memo,
      {
        deliveryType: (activeOrder as any).deliveryType,
        tracking: (activeOrder as any).tracking,
        trackingNumbers: (activeOrder as any).trackingNumbers
      }
    );

    if (success) {
      setSuccessMsg(`주문 ${(activeOrder as any).tracking || trackingInput} 출고 처리가 완료되었습니다.`);
      setActiveOrder(null);
      setItemsState([]);
      setTrackingInput("");
      setMemo("");
      setSelectedPickupOrders([]);

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
    const keyword = orderSearch.toLowerCase().trim();
    const keywordDigits = normalizePhoneDigits(orderSearch);
    const orderPhone = getPickupOrderPhone(order);
    const orderPhoneDigits = normalizePhoneDigits(orderPhone);
    const orderPhoneLast4 = getPhoneLast4(orderPhone);

    return (
      (order.name && order.name.toLowerCase().includes(keyword)) ||
      (order.receiver && order.receiver.toLowerCase().includes(keyword)) ||
      (order.order_no && String(order.order_no).includes(keyword)) ||
      (orderPhone && String(orderPhone).includes(keyword)) ||
      (keywordDigits && orderPhoneDigits.includes(keywordDigits)) ||
      (keywordDigits && orderPhoneLast4.includes(keywordDigits))
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
            setSelectedPickupOrders([]);
            setOrderSearch("");
            setCurrentPage(1);
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
            setSelectedPickupOrders([]);
            setOrderSearch("");
            setCurrentPage(1);
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
            setSelectedPickupOrders([]);
            setOrderSearch("");
            setCurrentPage(1);
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

            {/* 동일 고객 자동 선택 버튼 */}
            {deliveryMode === "PICKUP" && pendingOrders.length > 1 && (
              <div className="mb-2 flex justify-end">
                <button
                  onClick={() => {
                    if (selectedPickupOrders.length === 0) {
                      alert("기준 주문을 하나 먼저 선택하세요.");
                      return;
                    }

                    const baseOrder = pendingOrders.find(o => o.id === selectedPickupOrders[0]);
                    if (!baseOrder) return;

                    const baseCustomerKey = getPickupCustomerKey(baseOrder);

                    if (!baseCustomerKey) {
                      alert("선택한 주문의 고객명 또는 연락처 정보가 부족합니다.");
                      return;
                    }

                    const sameCustomerOrders = pendingOrders
                      .filter(o => getPickupCustomerKey(o) === baseCustomerKey)
                      .map(o => o.id);

                    setSelectedPickupOrders(sameCustomerOrders);
                  }}
                  className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-300"
                >
                  동일 고객 주문 자동 선택
                </button>
              </div>
            )}
            {/* 병합 버튼: PICKUP 모드에서 2개 이상 선택 시 노출 */}
            {deliveryMode === "PICKUP" && selectedPickupOrders.length >= 2 && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={async () => {
                    const confirmMerge = window.confirm(
                      `${selectedPickupOrders.length}개 주문을 병합하시겠습니까?`
                    );
                    if (!confirmMerge) return;

                    // 동일 고객인지 확인
                    const selectedOrders = pendingOrders.filter(o =>
                      selectedPickupOrders.includes(o.id)
                    );

                    const customerKeys = selectedOrders
                      .map(o => getPickupCustomerKey(o))
                      .filter(Boolean);
                    const uniqueCustomerKeys = [...new Set(customerKeys)];

                    if (customerKeys.length !== selectedOrders.length || uniqueCustomerKeys.length > 1) {
                      alert("이름과 연락처 뒤 4자리가 같은 주문만 병합할 수 있습니다.");
                      return;
                    }

                    const success = await inventoryService.mergePickupOrders(
                      selectedPickupOrders
                    );

                    if (success) {
                      alert("주문 병합 완료");
                      setSelectedPickupOrders([]);
                      loadPickupOrders();
                    } else {
                      alert("병합 실패");
                    }
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium"
                >
                  선택 주문 병합 ({selectedPickupOrders.length})
                </button>
              </div>
            )}

            {filteredOrders.length === 0 && (
              <div className="text-slate-500 text-sm">
                출고 대기 주문이 없습니다.
              </div>
            )}

            {paginatedOrders.map((order: any) => (
              <div
                key={order.id}
                className="p-4 border rounded-lg hover:bg-amber-50 transition flex items-start gap-3 justify-between"
              >
                {deliveryMode === "PICKUP" && (
                  <input
                    type="checkbox"
                    checked={selectedPickupOrders.includes(order.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPickupOrders(prev => [...prev, order.id]);
                      } else {
                        setSelectedPickupOrders(prev =>
                          prev.filter(id => id !== order.id)
                        );
                      }
                    }}
                    className="mt-1"
                  />
                )}

                <div
                  className="flex-1 cursor-pointer"
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

                        const normalizedSku = String(resolvedSku || "")
                          .trim()
                          .toUpperCase();

                        return {
                          sku: normalizedSku,
                          name: item.name || normalizedSku,
                          requiredQty: Number(item.qty ?? item.quantity ?? 0),
                          scannedQty: 0,
                          sourceOrderId: item.sourceOrderId || order.id
                        };
                      })
                    );
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-800">
                      {order.name ?? order.receiver ?? "고객"}
                    </div>

                    {deliveryMode === "PICKUP" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();

                          const baseName = getPickupOrderName(order);
                          const basePhoneLast4 = getPhoneLast4(getPickupOrderPhone(order));
                          const baseCustomerKey = getPickupCustomerKey(order);

                          if (!baseCustomerKey) {
                            alert("고객명 또는 연락처 정보가 부족하여 병합할 수 없습니다.");
                            return;
                          }

                          const sameCustomerOrders = pendingOrders
                            .filter(o => getPickupCustomerKey(o) === baseCustomerKey)
                            .map(o => o.id);

                          if (sameCustomerOrders.length < 2) {
                            alert("병합할 동일 고객 주문이 없습니다.");
                            return;
                          }

                          const confirmMerge = window.confirm(
                            `${baseName} (${basePhoneLast4}) 고객 주문 ${sameCustomerOrders.length}건을 병합하시겠습니까?`
                          );

                          if (!confirmMerge) return;

                          const success = await inventoryService.mergePickupOrders(
                            sameCustomerOrders
                          );

                          if (success) {
                            alert("주문 병합 완료");
                            setSelectedPickupOrders([]);
                            loadPickupOrders();
                          } else {
                            alert("병합 실패");
                          }
                        }}
                        className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded"
                      >
                        같은 고객 병합
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    주문번호: {order.order_no}
                  </div>
                  <div className="text-sm font-mono text-slate-700">
                    {order.total_price?.toLocaleString()}원
                  </div>
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
                {(activeOrder as any).trackingNumbers?.length > 0
                  ? (activeOrder as any).trackingNumbers.join(", ")
                  : activeOrder.tracking}
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

            <div className="flex items-center gap-3">
              {deliveryMode === "PICKUP" && (
                ((activeOrder as any)?.mergedOrders?.length > 0 ||
                  itemsState.some(i => i.sourceOrderId && i.sourceOrderId !== activeOrder.id))
              ) && (
                <button
                  onClick={async () => {
                    const confirmUnmerge = window.confirm("병합을 취소하시겠습니까?");
                    if (!confirmUnmerge) return;

                    try {
                      if (typeof (inventoryService as any).unmergePickupOrders !== "function") {
                        alert("병합 취소 기능이 아직 서버에 구현되지 않았습니다.");
                        return;
                      }

                      const success = await (inventoryService as any).unmergePickupOrders(activeOrder.id);

                      if (success) {
                        alert("병합이 취소되었습니다.");
                        setActiveOrder(null);
                        setItemsState([]);
                        setTrackingInput("");
                        setMemo("");
                        setSelectedPickupOrders([]);
                        loadPickupOrders();
                      } else {
                        alert("병합 취소 실패");
                      }
                    } catch (err) {
                      console.error(err);
                      alert("병합 취소 중 오류 발생");
                    }
                  }}
                  className="text-xs px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                >
                  병합 취소
                </button>
              )}

              <button 
                onClick={() => setActiveOrder(null)} 
                className="text-slate-400 hover:text-red-500 text-sm font-medium underline px-4"
              >
                Cancel
              </button>
            </div>
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
              {itemsState
                .sort((a: any, b: any) => {
                  const oa = (a as any).sourceOrderId || "";
                  const ob = (b as any).sourceOrderId || "";
                  return oa.localeCompare(ob);
                })
                .map((item, idx, arr) => {
                  const isComplete = item.scannedQty === item.requiredQty;
                  const isOver = item.scannedQty > item.requiredQty;

                  let rowClass = "border border-slate-200 bg-white";
                  if (isComplete) rowClass = "border-green-200 bg-green-50/50";
                  if (isOver) rowClass = "border-red-200 bg-red-50";

                  const currentOrder = (item as any).sourceOrderId;
                  const prevOrder = idx > 0 ? (arr[idx - 1] as any).sourceOrderId : null;
                  const showHeader = currentOrder && currentOrder !== prevOrder;

                  return (
                    <React.Fragment key={`${item.sku}-${item.sourceOrderId}-${idx}`}>
                      {showHeader && (
                        <div className="px-3 pt-4 pb-1 text-xs font-mono text-slate-400">
                          ─ 주문번호 {currentOrder}
                        </div>
                      )}

                      <div className={`p-4 rounded-lg flex items-center justify-between transition-all ${rowClass}`}>
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-2 h-12 rounded-full ${isComplete ? 'bg-green-500' : isOver ? 'bg-red-500' : 'bg-slate-300'}`}></div>

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
                              onClick={() => updateQuantity(idx, -1)}
                              className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100 text-slate-500"
                            >
                              <Minus size={16} />
                            </button>

                            <div className="flex flex-col items-center w-16">
                              <input 
                                type="number" 
                                value={item.scannedQty}
                                onChange={(e) => setManualQuantity(idx, parseInt(e.target.value) || 0)}
                                className={`w-16 text-center text-2xl font-bold bg-transparent outline-none ${isOver ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-amber-600'}`}
                              />
                              <span className="text-[10px] text-slate-400">SCANNED</span>
                            </div>

                            <button 
                              onClick={() => updateQuantity(idx, 1)}
                              className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100 text-slate-500"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
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
                  <div className="mb-4">
                    <textarea
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="출고 메모 (선택)"
                      className="w-full p-3 rounded-lg bg-slate-800 text-white border border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm resize-none"
                      rows={3}
                    />
                  </div>
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