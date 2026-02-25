import React, { useEffect, useState } from 'react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import { Package, TrendingUp, TrendingDown, AlertTriangle, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [todayInbound, setTodayInbound] = useState(0);
  const [todayOutbound, setTodayOutbound] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const allProducts = await inventoryService.getProducts();
      setProducts(allProducts);

      setLowStockItems(
        allProducts.filter((p: any) => {
          const stock = p.stock ?? 0;
          const threshold = p.lowStockThreshold ?? 10;
          return stock <= threshold;
        })
      );

      // 🔥 오늘 날짜 기준
      const today = new Date();
      const todayStr = today.toDateString();

      // 🔥 입고 집계
      const inboundLogs = await inventoryService.getInboundHistory();
      let inboundSum = 0;

      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      const todayEnd = new Date();
      todayEnd.setHours(23,59,59,999);

      inboundLogs.forEach((log: any) => {
        if (!log.createdAt?.seconds) return;

        const logDate = new Date(log.createdAt.seconds * 1000);
        if (logDate >= todayStart && logDate <= todayEnd) {
          inboundSum += log.quantity || 0;
        }
      });

      setTodayInbound(inboundSum);

      // 🔥 출고 집계
      const outboundLogs = await inventoryService.getOutboundLogs();
      let outboundSum = 0;

      outboundLogs.forEach((log: any) => {
        if (!log.createdAt?.seconds) return;

        const logDate = new Date(log.createdAt.seconds * 1000);
        if (logDate >= todayStart && logDate <= todayEnd) {
          outboundSum += log.quantity || 0;
        }
      });

      setTodayOutbound(outboundSum);

      // 🔥 최근 7일 차트 집계
      const daysMap: any = {};

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toDateString();
        daysMap[key] = {
          name: d.toLocaleDateString('ko-KR', { weekday: 'short' }),
          inbound: 0,
          outbound: 0
        };
      }

      inboundLogs.forEach((log: any) => {
        if (!log.createdAt?.seconds) return;

        const logDate = new Date(log.createdAt.seconds * 1000);
        const key = logDate.toDateString();

        if (daysMap[key]) {
          daysMap[key].inbound += log.quantity || 0;
        }
      });

      outboundLogs.forEach((log: any) => {
        if (!log.createdAt?.seconds) return;

        const logDate = new Date(log.createdAt.seconds * 1000);
        const key = logDate.toDateString();

        if (daysMap[key]) {
          daysMap[key].outbound += log.quantity || 0;
        }
      });

      setChartData(Object.values(daysMap));
    };

    fetchData();
  }, []);

  const totalStock = products.reduce(
    (acc, curr: any) => acc + (curr.stock || 0),
    0
  );


  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">총 재고 수량</p>
            <h3 className="text-3xl font-bold text-slate-900">{totalStock.toLocaleString()}</h3>
            <p className="text-xs text-green-600 mt-2 flex items-center font-medium">
              <TrendingUp size={14} className="mr-1" />
              +12.5% vs 지난주
            </p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Package size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">오늘 입고 예정</p>
            <h3 className="text-3xl font-bold text-slate-900">{todayInbound}</h3>
            <p className="text-xs text-slate-400 mt-2">3건 처리 대기중</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">오늘 출고 완료</p>
            <h3 className="text-3xl font-bold text-slate-900">{todayOutbound}</h3>
            <p className="text-xs text-amber-600 mt-2 flex items-center font-medium">
              <TrendingDown size={14} className="mr-1" />
              피크 타임 진행중
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <TrendingDown size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6">주간 입출고 현황</h3>
          <div className="w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{fill: '#64748b'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill: '#64748b'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="inbound" name="입고" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="outbound" name="출고" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              부족 재고 알림
            </h3>
            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-bold">
              {lowStockItems.length} items
            </span>
          </div>
          <div className="flex-1 overflow-auto max-h-[280px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                <tr>
                  <th className="px-6 py-3">제품명</th>
                  <th className="px-6 py-3 text-right">현황</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStockItems.map((item) => (
                  <tr key={item.sku} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.sku}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-red-600 font-bold">{item.stock}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500">{item.lowStockThreshold}</span>
                    </td>
                  </tr>
                ))}
                {lowStockItems.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-8 text-center text-slate-400">
                      부족한 재고가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
            <button className="w-full text-sm text-slate-600 font-medium hover:text-amber-600 flex items-center justify-center gap-1 transition-colors">
              전체 재고 보기 <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;