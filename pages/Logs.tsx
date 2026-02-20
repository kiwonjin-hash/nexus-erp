import React, { useState, useEffect } from "react";
import { inventoryService } from "../services/inventoryService";
import { FileText } from "lucide-react";

type UnifiedLog = {
  id: string;
  type: "OUTBOUND";
  sku: string;
  productName: string;
  quantity: number;
  operator?: string;
  orderId?: string;
  trackingNumber?: string;
  date: string;
};

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const data = await inventoryService.getOutboundLogs(search);
      setLogs(data);
    };
    load();
  }, [search]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex items-center gap-3">
        <FileText className="text-amber-600" />
        <h2 className="text-xl font-bold text-slate-800">
          입출고 상세 로그
        </h2>
      </div>
 {/* 🔥 여기 추가 */}
    <div className="p-4 border-b border-slate-200">
      <input
        type="text"
        placeholder="송장번호 / 주문번호 / SKU / 상품명 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
    </div>
      {/* Table */}
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
              <th className="px-6 py-3 text-sm font-semibold text-slate-500 text-right">
                수량
              </th>
              <th className="px-6 py-3 text-sm font-semibold text-slate-500 text-right">
                작업자
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {logs.map((log) => (
              <tr
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                  {log.date}
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold ${
                      log.type === "INBOUND"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {log.type}
                  </span>
                </td>

                <td className="px-6 py-4 text-slate-900 font-medium">
                  {log.productName}
                </td>

                <td className="px-6 py-4 text-right font-bold text-red-600">
                  -{log.quantity}
                </td>

                <td className="px-6 py-4 text-right text-slate-500">
                  {log.operator || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-[600px] rounded-xl shadow-xl p-8 relative">

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
              <div><b>구분:</b> {selectedLog.type}</div>
              <div><b>제품명:</b> {selectedLog.productName}</div>
              <div><b>SKU:</b> {selectedLog.sku}</div>
              <div><b>수량:</b> -{selectedLog.quantity}</div>
              <div><b>주문번호:</b> {selectedLog.orderId || "-"}</div>
              <div><b>송장번호:</b> {selectedLog.trackingNumber || "-"}</div>
              <div><b>작업자:</b> {selectedLog.operator || "-"}</div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Logs;