import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  increment,
  query,
  limit,
  addDoc,
  serverTimestamp,
  setDoc,
  where,
  orderBy,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  writeBatch
} from "firebase/firestore";

import { db } from "../firebase";
import { Product } from "../types";

class InventoryService {

  async getProducts(): Promise<Product[]> {
    const snapshot = await getDocs(collection(db, "inventory"));
    return snapshot.docs.map(docSnap => ({
      sku: docSnap.id,
      ...docSnap.data()
    })) as Product[];
  }

  async getProductBySku(sku: string) {
    const ref = doc(db, "inventory", sku.toUpperCase());
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    return {
      sku: snap.id,
      ...snap.data()
    };
  }

  async createProduct(product: {
    sku: string;
    name: string;
    category: string;
    stock: number;
    link?: string;
  }) {
    const normalizedSku = product.sku.trim().toUpperCase();
    const ref = doc(db, "inventory", normalizedSku);

    await setDoc(ref, {
      name: product.name,
      category: product.category,
      stock: product.stock,
      link: product.link || "",
      lowStockThreshold: 10,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
  }

  async updateProduct(sku: string, data: any) {
    const ref = doc(db, "inventory", sku.trim().toUpperCase());
    await updateDoc(ref, {
      ...data,
      lastUpdated: serverTimestamp()
    });
  }

  async addInbound(sku: string, quantity: number, operator: string) {
    try {
      const ref = doc(db, "inventory", sku.trim().toUpperCase());

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

  async getInboundHistory() {
    const q = query(
      collection(db, "logs"),
      where("type", "==", "INBOUND")
    );

    const snapshot = await getDocs(q);

    const logs = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        sku: data.sku,
        quantity: data.quantity,
        operator: data.operator,
        createdAt: data.createdAt || null
      };
    });

    return logs.sort(
      (a, b) =>
        (b.createdAt?.seconds || 0) -
        (a.createdAt?.seconds || 0)
    );
  }

  async increaseStock(sku: string, qty: number) {
    const ref = doc(db, "inventory", sku.trim().toUpperCase());
    await updateDoc(ref, { stock: increment(qty) });
  }

  async decreaseStock(sku: string, qty: number) {
    const ref = doc(db, "inventory", sku.trim().toUpperCase());
    await updateDoc(ref, { stock: increment(-qty) });
  }

  async completeOrder(orderId: string, items: { sku: string; qty: number }[]) {
    try {
      for (const item of items) {
        const normalizedSku = item.sku.trim().toUpperCase();
        const qty = Number(item.qty) || 0; // 수량이 없으면 0 처리

        const productRef = doc(db, "inventory", normalizedSku);

        // 🔥 재고 부족이어도 막지 않고 그대로 차감 (마이너스 허용)
        await updateDoc(productRef, {
          stock: increment(-qty)
        });
      }

      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data() || {};

      const productNames = (
        await Promise.all(
          items.map(async (item) => {
            const normalizedSku = item.sku.trim().toUpperCase();
            const productRef = doc(db, "inventory", normalizedSku);
            const productSnap = await getDoc(productRef);
            const productData = productSnap.data() || {};
            return productData.name || "";
          })
        )
      ).join(" ");

      const productNameTokens = productNames
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      await addDoc(collection(db, "logs"), {
        type: orderData.deliveryType || "POST",
        deliveryType: orderData.deliveryType || "POST",
        orderId,
        operator: "Admin",
        customerName: orderData.name || "",
        customerNameLower: (orderData.name || "").toLowerCase(),
        skuList: items.map(item => item.sku.trim().toUpperCase()),
        productNameTokens,
        searchableText: (
          productNames +
          " " +
          orderId +
          " " +
          (orderData.name || "") +
          " " +
          items.map(item => item.sku).join(" ")
        ).toLowerCase(),
        trackingNumber: orderData.tracking || "",
        createdAt: serverTimestamp(),
        items: await Promise.all(
          items.map(async (item) => {
            const normalizedSku = item.sku.trim().toUpperCase();
            const productRef = doc(db, "inventory", normalizedSku);
            const productSnap = await getDoc(productRef);
            const productData = productSnap.data() || {};
            const productName = productData.name || "";
            const productLink = productData.link || "";

            return {
              sku: normalizedSku,
              name: productName,
              quantity: item.qty,
              link: productLink
            };
          })
        )
      });

      await updateDoc(orderRef, {
        status: "COMPLETED"
      });

      return true;
    } catch (error) {
      console.error("출고 처리 실패:", error);
      return false;
    }
  }

  async getOrderByTracking(trackingNumber: string) {
    const q = query(
      collection(db, "orders"),
      where("tracking", "==", trackingNumber)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];

    return {
      orderId: docSnap.id,
      ...docSnap.data()
    };
  }

  async getOutboundLogs(
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const logs: any[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const timestamp = data.createdAt || null;
      const items = data.items || [];
      const firstItem = items.length > 0 ? items[0] : null;

      return {
        id: docSnap.id,
        type: data.type,
        items,
        sku: firstItem?.sku || "",
        productName: firstItem?.name || "",
        quantity: firstItem?.quantity || 0,
        operator: data.operator || "",
        customerName: data.customerName || "",
        orderId: data.orderId || "",
        trackingNumber: data.trackingNumber || "",
        createdAt: timestamp,
        date: timestamp?.seconds
          ? new Date(timestamp.seconds * 1000).toLocaleString()
          : ""
      };
    });

    // 👇 배열은 그대로 유지하면서 lastVisible 추가
    (logs as any).lastVisible =
      snapshot.docs[snapshot.docs.length - 1] || null;

    return logs;
  }
  // 🔎 주문번호 검색
  async searchByOrderId(
    orderId: string,
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("orderId", "==", orderId),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("orderId", "==", orderId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const logs: any[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    (logs as any).lastVisible =
      snapshot.docs[snapshot.docs.length - 1] || null;

    return logs;
  }

  // 🔎 송장번호 검색
  async searchByTracking(
    trackingNumber: string,
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("trackingNumber", "==", trackingNumber),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("trackingNumber", "==", trackingNumber),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const logs: any[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    (logs as any).lastVisible =
      snapshot.docs[snapshot.docs.length - 1] || null;

    return logs;
  }

  // 🔎 SKU 검색
  async searchBySku(
    sku: string,
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("skuList", "array-contains", sku.trim().toUpperCase()),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("skuList", "array-contains", sku.trim().toUpperCase()),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const logs: any[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    (logs as any).lastVisible =
      snapshot.docs[snapshot.docs.length - 1] || null;

    return logs;
  }

  // 🔎 주문자 검색
  async searchByCustomer(
    name: string,
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("customerNameLower", "==", name.toLowerCase()),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("customerNameLower", "==", name.toLowerCase()),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const logs: any[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    (logs as any).lastVisible =
      snapshot.docs[snapshot.docs.length - 1] || null;

    return logs;
  }

  // 🔎 상품명 부분 검색 (prefix 기반 searchableText 사용)
  async searchByProductName(
    keyword: string,
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    const lower = keyword.toLowerCase();

    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("productNameTokens", "array-contains", lower),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("productNameTokens", "array-contains", lower),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const logs: any[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    (logs as any).lastVisible =
      snapshot.docs[snapshot.docs.length - 1] || null;

    return logs;
  }

  // 🔧 기존 로그 검색 필드 마이그레이션 (1회 실행용)
  async migrateLogsForSearch() {
    const snapshot = await getDocs(collection(db, "logs"));
    const batch = writeBatch(db);

    snapshot.docs.forEach((docSnap) => {
      const data: any = docSnap.data();

      // 출고 로그만 처리
      if (!["POST", "VALEX", "PICKUP"].includes(data.type)) return;

      const items = data.items || [];

      const skuList = items.map((item: any) =>
        (item.sku || "").toUpperCase()
      );

      const customerNameLower = (data.customerName || "").toLowerCase();

      const productNames = items
        .map((item: any) => item.name || "")
        .join(" ");

      const productNameTokens = productNames
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      const searchableText = (
        productNames +
        " " +
        (data.orderId || "") +
        " " +
        (data.customerName || "") +
        " " +
        skuList.join(" ")
      ).toLowerCase();

      batch.update(docSnap.ref, {
        skuList,
        customerNameLower,
        searchableText,
        productNameTokens
      });
    });

    await batch.commit();
    console.log("✅ 기존 로그 마이그레이션 완료");
  }
  // 🗑 단일 상품 삭제
  async deleteProduct(sku: string) {
    const normalizedSku = sku.trim().toUpperCase();
    const ref = doc(db, "inventory", normalizedSku);
    await deleteDoc(ref);
  }

  // 🗑 다중 상품 삭제 (배치 처리)
  async deleteMultipleProducts(skus: string[]) {
    const batch = writeBatch(db);

    skus.forEach((sku) => {
      const normalizedSku = sku.trim().toUpperCase();
      const ref = doc(db, "inventory", normalizedSku);
      batch.delete(ref);
    });

    await batch.commit();
  }
}

export const inventoryService = new InventoryService();
