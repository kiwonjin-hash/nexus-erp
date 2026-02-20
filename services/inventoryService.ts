import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  increment,
  query,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";

import { db } from "../firebase";
import { Product } from "../types";

class InventoryService {

  // 🔹 제품 전체 조회
  async getProducts(): Promise<Product[]> {
    const snapshot = await getDocs(collection(db, "inventory"));

    return snapshot.docs.map(docSnap => ({
      sku: docSnap.id,
      ...docSnap.data()
    })) as Product[];
  }

  // 🔹 SKU 단건 조회
  async getProductBySku(sku: string) {
    const ref = doc(db, "inventory", sku.toUpperCase());
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return {
      sku: snap.id,
      ...snap.data()
    };
  }

  // 🔹 제품 생성
  async createProduct(product: {
    sku: string;
    name: string;
    category: string;
    stock: number;
  }) {
    const ref = doc(db, "inventory", product.sku);

    await setDoc(ref, {
      name: product.name,
      category: product.category,
      stock: product.stock,
      lowStockThreshold: 10,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
  }

  // 🔹 입고 처리
  async addInbound(sku: string, quantity: number, operator: string) {
    try {
      const ref = doc(db, "inventory", sku);

      await updateDoc(ref, {
        stock: increment(quantity),
        lastUpdated: serverTimestamp()
      });

      await addDoc(collection(db, "logs"), {
        type: "INBOUND",
        sku,
        quantity,
        operator,
        createdAt: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error("입고 처리 실패:", error);
      return false;
    }
  }

  // 🔹 입고 이력 조회
  async getInboundHistory() {
    const q = query(
      collection(db, "inboundLogs"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        sku: data.sku,
        quantity: data.quantity,
        operator: data.operator,
        date: data.createdAt?.seconds
          ? new Date(data.createdAt.seconds * 1000).toLocaleString()
          : "-"
      };
    });
  }

  // 🔹 재고 증가
  async increaseStock(sku: string, qty: number) {
    const ref = doc(db, "inventory", sku);
    await updateDoc(ref, { stock: increment(qty) });
  }

  // 🔹 재고 감소
  async decreaseStock(sku: string, qty: number) {
    const ref = doc(db, "inventory", sku);
    await updateDoc(ref, { stock: increment(-qty) });
  }

  // 🔹 주문 완료 처리
  async completeOrder(orderId: string, items: { sku: string; qty: number }[]) {
    try {
      for (const item of items) {
  
        // 1️⃣ 재고 차감
        const productRef = doc(db, "inventory", item.sku);
        await updateDoc(productRef, {
          stock: increment(-item.qty)
        });
  
        // 2️⃣ 제품명 가져오기
        const productSnap = await getDoc(productRef);
        const productName = productSnap.data()?.name || "";
  
        // 3️⃣ 로그 저장
        await addDoc(collection(db, "logs"), {
          type: "OUTBOUND",
          orderId,
          operator: "Admin",
          createdAt: serverTimestamp(),
          items: await Promise.all(
            items.map(async (item) => {
              const productRef = doc(db, "inventory", item.sku);
              const productSnap = await getDoc(productRef);
              const productName = productSnap.data()?.name || "";
        
              return {
                sku: item.sku,
                name: productName,
                quantity: item.qty
              };
            })
          )
        });
      }
  
      // 4️⃣ 주문 상태 변경
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        status: "COMPLETED"
      });
  
      return true;
  
    } catch (error) {
      console.error("출고 처리 실패:", error);
      return false;
    }
  }

  // 🔹 운송장으로 주문 찾기
  async getOrderByTracking(trackingNumber: string) {
    const q = query(
      collection(db, "orders"),
      where("trackingNumber", "==", trackingNumber)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];

    return {
      orderId: docSnap.id,
      ...docSnap.data()
    };
  }

  async getOutboundLogs(search?: string) {
    const logsRef = collection(db, "logs");
  
    const q = query(
      logsRef,
      where("type", "==", "OUTBOUND"),
      orderBy("createdAt", "desc")
    );
  
    const snapshot = await getDocs(q);
  
    let results = snapshot.docs.map(doc => {
      const data = doc.data();

      const items = data.items || [];
      const firstItem = items.length > 0 ? items[0] : null;

      return {
        id: doc.id,
        type: data.type,
        items: items,
        sku: firstItem?.sku || "",
        productName: firstItem?.name || "",
        quantity: firstItem?.quantity || 0,
        operator: data.operator || "",
        orderId: data.orderId || "",
        trackingNumber: data.trackingNumber || "",
        date: data.createdAt
          ? new Date(data.createdAt.seconds * 1000).toLocaleString()
          : ""
      };
    });
  
    if (search) {
      const keyword = search.toLowerCase();
  
      results = results.filter(log =>
        log.productName.toLowerCase().includes(keyword) ||
        log.sku.toLowerCase().includes(keyword) ||
        log.orderId.toLowerCase().includes(keyword) ||
        log.trackingNumber.toLowerCase().includes(keyword) ||
        log.items?.some((item: any) =>
          item.name?.toLowerCase().includes(keyword) ||
          item.sku?.toLowerCase().includes(keyword)
        )
      );
    }
  
    return results;
  }
}



export const inventoryService = new InventoryService();
