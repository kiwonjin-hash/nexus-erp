import React, { useState, useEffect } from "react";
import { inventoryService } from "../services/inventoryService";
(window as any).inventoryService = inventoryService;
import { FileText, Camera } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

type UnifiedLog = {
  id: string;
  type: string;
  deliveryType?: string;
  items: {
    sku: string;
    name: string;
    quantity: number;
    link?: string;
  }[];
  operator?: string;
  orderId?: string;
  trackingNumber?: string;
  customerName?: string;
  memo?: string;
  needsReview?: boolean;
  unmatchedItems?: {
    sku?: string;
    name?: string;
    qty: number;
    reason: string;
  }[];
  date: string;
};

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null);
  const [linkingIndex, setLinkingIndex] = useState<number | null>(null);
  const [targetSku, setTargetSku] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [skuSuggestions, setSkuSuggestions] = useState<
    { sku: string; name: string; stock: number }[]
  >([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"orderId" | "tracking" | "sku" | "customer" | "product">("tracking");
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<any[]>([null]);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 50;

  const [isSearchMode, setIsSearchMode] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<"ALL" | "POST" | "VALEX" | "PICKUP">("ALL");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerInstance, setScannerInstance] = useState<Html5Qrcode | null>(null);

  const handleBarcodeScan = async () => {
    setIsScannerOpen(true);
  };

  useEffect(() => {
    if (!isScannerOpen) return;

    const startScanner = async () => {
      const scanner = new Html5Qrcode("reader");
      setScannerInstance(scanner);

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 300, height: 150 },
            formatsToSupport: [
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.QR_CODE
            ]
          },
          async (decodedText) => {
            setSearch(decodedText);

            await scanner.stop();
            setIsScannerOpen(false);

            handleSearch(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error("Scanner start failed:", err);
      }
    };

    startScanner();
  }, [isScannerOpen]);

  const fetchSearchPage = async (
    pageNumber: number,
    cursor?: any,
    keyword?: string
  ) => {
    const query = keyword ?? search;
    let data: any;

    if (filter === "orderId") {
      data = await inventoryService.searchByOrderId(query, pageSize, cursor);
    } else if (filter === "tracking") {
      data = await inventoryService.searchByTracking(query, pageSize, cursor);
    } else if (filter === "sku") {
      data = await inventoryService.searchBySku(query, pageSize, cursor);
    } else if (filter === "customer") {
      data = await inventoryService.searchByCustomer(query, pageSize, cursor);
    } else {
      data = await inventoryService.searchByProductName(query, pageSize, cursor);
    }

    return data;
  };

  useEffect(() => {
    loadFirstPage();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedLog(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


  const loadFirstPage = async () => {
    const data: any = await inventoryService.getOutboundLogs(pageSize);

    setLogs(data);
    setPage(1);
    setPageCursors([null, (data as any).lastVisible]);
    setHasMore(!!(data as any).lastVisible);
  };

  const loadPage = async (pageNumber: number) => {
    if (pageNumber < 1) return;

    const cursor = pageCursors[pageNumber - 1] || null;

    if (!cursor && pageNumber !== 1) return;

    let data: any;

    if (isSearchMode) {
      data = await fetchSearchPage(pageNumber, cursor);
    } else {
      data = await inventoryService.getOutboundLogs(pageSize, cursor);
    }

    if (isSearchMode) {
      data = data.map((d: any) => {
        const timestamp = d.createdAt || null;
        return {
          ...d,
          date: timestamp?.seconds
            ? new Date(timestamp.seconds * 1000).toLocaleString()
            : ""
        };
      });
    }

    setLogs(data);
    setPage(pageNumber);

    const newCursors = [...pageCursors];
    newCursors[pageNumber] = (data as any).lastVisible;
    setPageCursors(newCursors);

    setHasMore(!!(data as any).lastVisible);
  };

  const handleSearch = async (overrideKeyword?: any) => {
    const keyword = String(overrideKeyword ?? search ?? "");

    if (!keyword.trim()) {
      setIsSearchMode(false);
      loadFirstPage();
      return;
    }

    setIsSearchMode(true);

    const data: any = await fetchSearchPage(1, undefined, keyword);

    const formatted = data.map((d: any) => {
      const timestamp = d.createdAt || null;
      return {
        ...d,
        date: timestamp?.seconds
          ? new Date(timestamp.seconds * 1000).toLocaleString()
          : ""
      };
    });

    setLogs(formatted);
    setPage(1);
    setPageCursors([null, (data as any).lastVisible]);
    setHasMore(!!(data as any).lastVisible);
  };


  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 flex items-center gap-3">
        <FileText className="text-amber-600" />
        <h2 className="text-xl font-bold text-slate-800">
          입출고 상세 로그
        </h2>
      </div>

      <div className="p-4 border-b border-slate-200 flex gap-2">
        <select
          value={deliveryFilter}
          onChange={(e) => setDeliveryFilter(e.target.value as any)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="ALL">전체</option>
          <option value="POST">우체국</option>
          <option value="VALEX">발렉스</option>
          <option value="PICKUP">방문수령</option>
        </select>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="orderId">주문번호</option>
          <option value="tracking">송장번호</option>
          <option value="sku">SKU</option>
          <option value="customer">주문자</option>
          <option value="product">상품명</option>
        </select>

        <input
          type="text"
          placeholder="검색어 입력"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        <button
          onClick={() => handleSearch()}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg"
        >
          검색
        </button>

        <button
          onClick={handleBarcodeScan}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2 hover:bg-slate-800"
        >
          <Camera size={16} />
          스캔
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500">
                일시
              </th>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500">
                구분
              </th>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500">
                제품명
              </th>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500">
                주문자
              </th>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500 text-right">
                수량
              </th>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500 text-right">
                작업자
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {logs
              .filter((log) => {
                if (deliveryFilter === "ALL") return true;
                const delivery = log.deliveryType || log.type;
                return delivery === deliveryFilter;
              })
              .map((log) => (
              <tr
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                  {log.date}
                </td>

                <td className="px-6 py-4">
                  {(() => {
                    const delivery = log.deliveryType || log.type;

                    const style =
                      delivery === "POST"
                        ? "bg-blue-100 text-blue-800"
                        : delivery === "VALEX"
                        ? "bg-purple-100 text-purple-800"
                        : delivery === "PICKUP"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600";

                    const label =
                      delivery === "POST"
                        ? "우체국"
                        : delivery === "VALEX"
                        ? "발렉스"
                        : delivery === "PICKUP"
                        ? "방문수령"
                        : "출고";

                    return (
                      <span className={`px-2 py-1 rounded text-xs font-bold ${style}`}>
                        {label}
                      </span>
                    );
                  })()}
                </td>

                <td className="px-6 py-4 text-slate-900 font-medium">
                  {log.items.map((item, idx) => (
                    <div key={idx} className="leading-6">
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {item.name || item.sku || "제품명 없음"}
                        </a>
                      ) : (
                        <span className="text-slate-900">
                          {item.name || item.sku || "제품명 없음"}
                        </span>
                      )}
                    </div>
                  ))}
                  {log.memo && (
                    <div className="mt-1 text-xs text-amber-600 font-medium">
                      📝 {log.memo}
                    </div>
                  )}
                  {(log.needsReview || (log.unmatchedItems && log.unmatchedItems.length > 0)) && (
                    <div className="mt-1 text-xs text-red-600 font-bold space-y-1">
                      <div>🔴 SKU 미매칭 (검토 필요)</div>
                      {log.unmatchedItems?.map((u, i) => (
                        <div key={i} className="text-xs text-red-500">
                          · {u.name || "제품명 없음"} (-{u.qty})
                        </div>
                      ))}
                    </div>
                  )}
                </td>

                <td className="px-6 py-4 text-slate-700 font-medium">
                  {log.customerName || "-"}
                </td>

                <td className="px-6 py-4 text-right font-bold text-red-600">
                  {log.items.map((item, idx) => (
                    <div key={idx} className="leading-6">
                      -{item.quantity}
                    </div>
                  ))}
                </td>

                <td className="px-6 py-4 text-right text-slate-500">
                  {log.operator || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-slate-200 flex justify-center gap-2">
        {Array.from({ length: page }).map((_, idx) => {
          const p = idx + 1;
          return (
            <button
              key={p}
              onClick={() => loadPage(p)}
              className={`px-3 py-1 border rounded ${
                p === page ? "bg-amber-500 text-white border-amber-500" : ""
              }`}
            >
              {p}
            </button>
          );
        })}

        {hasMore && (
          <button
            onClick={() => loadPage(page + 1)}
            className="px-3 py-1 border rounded"
          >
            다음
          </button>
        )}
      </div>

      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-4 relative">
            <button
              onClick={async () => {
                if (scannerInstance) {
                  await scannerInstance.stop();
                }
                setIsScannerOpen(false);
              }}
              className="absolute top-2 right-2 text-slate-500"
            >
              ✕
            </button>
            <div id="reader" className="w-full" />
          </div>
        </div>
      )}

      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white w-[600px] rounded-xl shadow-xl p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-red-500"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold mb-6">
              로그 상세 정보
            </h3>

            <div className="space-y-3 text-sm">
              <div><b>일시:</b> {selectedLog.date}</div>
              <div>
                <b>구분:</b>{" "}
                {(() => {
                  const delivery = selectedLog.deliveryType || selectedLog.type;

                  if (delivery === "POST") return "우체국";
                  if (delivery === "VALEX") return "발렉스";
                  if (delivery === "PICKUP") return "방문수령";
                  return "출고";
                })()}
              </div>
              <div>
                <b>상품 목록:</b>
                <div className="mt-2 space-y-1">
                  {selectedLog.items.map((item, idx) => (
                    <div key={idx} className="border rounded px-3 py-2 bg-slate-50">
                      <div>
                        <b>제품명:</b>{" "}
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {item.name || item.sku || "제품명 없음"}
                          </a>
                        ) : (
                          <span className="text-slate-900">
                            {item.name || item.sku || "제품명 없음"}
                          </span>
                        )}
                      </div>
                      <div><b>SKU:</b> {item.sku}</div>
                      <div><b>수량:</b> -{item.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div><b>주문자:</b> {selectedLog.customerName || "-"}</div>
              <div><b>주문번호:</b> {selectedLog.orderId || "-"}</div>
              <div><b>송장번호:</b> {selectedLog.trackingNumber || "-"}</div>
              <div><b>작업자:</b> {selectedLog.operator || "-"}</div>
              {selectedLog.memo && (
                <div>
                  <b>메모:</b> {selectedLog.memo}
                </div>
              )}
              {selectedLog.needsReview && selectedLog.unmatchedItems && selectedLog.unmatchedItems.length > 0 && (
                <div>
                  <b className="text-red-600">SKU 미매칭 항목:</b>
                  <div className="mt-2 space-y-1">
                    {selectedLog.unmatchedItems.map((item, idx) => (
                      <div key={idx} className="border border-red-300 rounded px-3 py-3 bg-red-50 text-sm space-y-2">
                        {item.name && (
                          <div>
                            <b>제품명:</b> <span className="text-slate-900">{item.name}</span>
                          </div>
                        )}
                        <div>
                          <b>SKU:</b> {item.sku || "(없음)"}
                        </div>
                        <div><b>수량:</b> {item.qty}</div>
                        <div><b>사유:</b> {item.reason}</div>

                        {linkingIndex === idx ? (
                          <div className="flex gap-2 mt-2 relative">
                            <input
                              type="text"
                              placeholder="연결할 SKU 입력"
                              value={targetSku}
                              autoFocus
                              onChange={async (e) => {
                                const value = e.target.value;
                                setTargetSku(value);

                                if (value.trim().length >= 1) {
                                  const results = await inventoryService.searchInventory(value);
                                  setSkuSuggestions(results);
                                } else {
                                  setSkuSuggestions([]);
                                }
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  if (!targetSku.trim()) return;

                                  setIsLinking(true);
                                  const success = await inventoryService.linkUnmatchedItem(
                                    selectedLog.id,
                                    idx,
                                    targetSku
                                  );
                                  setIsLinking(false);

                                  if (success) {
                                    alert("SKU 연결 완료");
                                    setLinkingIndex(null);
                                    setTargetSku("");
                                    setSelectedLog(null);
                                    loadFirstPage();
                                  } else {
                                    alert("SKU 연결 실패");
                                  }
                                }
                              }}
                              className="flex-1 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            {skuSuggestions.length > 0 && (
                              <div className="absolute bg-white border border-slate-200 rounded shadow-md mt-1 w-full max-h-40 overflow-auto z-50">
                                {skuSuggestions.map((s, i) => (
                                  <div
                                    key={i}
                                    onClick={() => {
                                      setTargetSku(s.sku);
                                      setSkuSuggestions([]);
                                    }}
                                    className="px-3 py-2 text-xs hover:bg-slate-100 cursor-pointer"
                                  >
                                    <div className="font-bold">{s.sku}</div>
                                    <div className="text-slate-500">{s.name} (재고: {s.stock})</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              disabled={isLinking}
                              onClick={async () => {
                                if (!targetSku.trim()) return;

                                setIsLinking(true);
                                const success = await inventoryService.linkUnmatchedItem(
                                  selectedLog.id,
                                  idx,
                                  targetSku
                                );
                                setIsLinking(false);

                                if (success) {
                                  alert("SKU 연결 완료");
                                  setLinkingIndex(null);
                                  setTargetSku("");
                                  setSelectedLog(null);
                                  loadFirstPage();
                                } else {
                                  alert("SKU 연결 실패");
                                }
                              }}
                              className="px-3 py-1 bg-amber-500 text-white rounded text-xs"
                            >
                              연결
                            </button>
                            <button
                              onClick={() => {
                                setLinkingIndex(null);
                                setTargetSku("");
                              }}
                              className="px-3 py-1 bg-slate-300 rounded text-xs"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setLinkingIndex(idx);
                              setTargetSku("");
                            }}
                            className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs"
                          >
                            기존 상품에 연결
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Logs;