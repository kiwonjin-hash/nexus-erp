import { Product, Order, LogEntry, InboundRecord } from './types';

export const MOCK_PRODUCTS: Product[] = [
  { sku: 'NX-1001', name: 'Premium Leather Desk Mat', category: 'Desk Accessories', currentStock: 142, minStockLevel: 20, lastUpdated: '2023-10-25', price: 45000 },
  { sku: 'NX-1002', name: 'Aluminum Laptop Stand', category: 'Stands', currentStock: 8, minStockLevel: 15, lastUpdated: '2023-10-24', price: 62000 },
  { sku: 'NX-2001', name: 'Mechanical Keyboard (Red Switch)', category: 'Peripherals', currentStock: 55, minStockLevel: 10, lastUpdated: '2023-10-26', price: 125000 },
  { sku: 'NX-2002', name: 'Wireless Ergonomic Mouse', category: 'Peripherals', currentStock: 32, minStockLevel: 10, lastUpdated: '2023-10-22', price: 89000 },
  { sku: 'NX-3001', name: 'USB-C Hub 7-in-1', category: 'Accessories', currentStock: 3, minStockLevel: 25, lastUpdated: '2023-10-20', price: 55000 },
  { sku: 'NX-3002', name: '4K HDMI Cable (2m)', category: 'Cables', currentStock: 210, minStockLevel: 50, lastUpdated: '2023-10-26', price: 15000 },
];

export const MOCK_ORDERS: Order[] = [
  {
    orderId: 'ORD-2023-8821',
    trackingNumber: 'TRK998877',
    customerName: 'Alice Kim',
    status: 'PENDING',
    items: [
      { sku: 'NX-1001', name: 'Premium Leather Desk Mat', requiredQty: 1, scannedQty: 0 },
      { sku: 'NX-2002', name: 'Wireless Ergonomic Mouse', requiredQty: 1, scannedQty: 0 },
    ]
  },
  {
    orderId: 'ORD-2023-8822',
    trackingNumber: 'TRK112233',
    customerName: 'Min-su Park',
    status: 'PENDING',
    items: [
      { sku: 'NX-3001', name: 'USB-C Hub 7-in-1', requiredQty: 2, scannedQty: 0 },
      { sku: 'NX-3002', name: '4K HDMI Cable (2m)', requiredQty: 5, scannedQty: 0 },
      { sku: 'NX-1002', name: 'Aluminum Laptop Stand', requiredQty: 1, scannedQty: 0 },
    ]
  }
];

export const MOCK_LOGS: LogEntry[] = [
  { id: 'LOG-001', date: '2023-10-26 14:30', sku: 'NX-1001', productName: 'Premium Leather Desk Mat', change: 50, type: 'INBOUND', operator: 'Staff A' },
  { id: 'LOG-002', date: '2023-10-26 15:15', sku: 'NX-3002', productName: '4K HDMI Cable (2m)', change: -2, type: 'OUTBOUND', operator: 'Staff B' },
  { id: 'LOG-003', date: '2023-10-25 09:00', sku: 'NX-2001', productName: 'Mechanical Keyboard', change: 20, type: 'INBOUND', operator: 'Staff A' },
  { id: 'LOG-004', date: '2023-10-24 16:45', sku: 'NX-1002', productName: 'Aluminum Laptop Stand', change: -1, type: 'OUTBOUND', operator: 'Staff C' },
  { id: 'LOG-005', date: '2023-10-24 11:20', sku: 'NX-3001', productName: 'USB-C Hub 7-in-1', change: -5, type: 'OUTBOUND', operator: 'Staff B' },
];

export const MOCK_INBOUND_HISTORY: InboundRecord[] = [
    { id: 'IN-001', date: '2023-10-26', sku: 'NX-1001', productName: 'Premium Leather Desk Mat', quantity: 50, operator: 'Staff A' },
    { id: 'IN-002', date: '2023-10-25', sku: 'NX-2001', productName: 'Mechanical Keyboard', quantity: 20, operator: 'Staff A' },
];