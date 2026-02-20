export interface Product {
  sku: string;
  name: string;
  category: string;
  currentStock: number;
  minStockLevel: number;
  lastUpdated: string;
  price: number;
}

export interface InboundRecord {
  id: string;
  date: string;
  sku: string;
  productName: string;
  quantity: number;
  operator: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  requiredQty: number;
  scannedQty: number; // Local state tracking
}

export interface Order {
  orderId: string;
  trackingNumber: string;
  customerName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
  items: OrderItem[];
}

export interface LogEntry {
  id: string;
  date: string;
  sku: string;
  productName: string;
  change: number; // Positive for inbound, negative for outbound
  type: 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT';
  operator: string;
}

export type PageView = 'DASHBOARD' | 'INBOUND' | 'OUTBOUND' | 'INVENTORY' | 'LOGS';