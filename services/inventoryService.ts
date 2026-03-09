import {
  collection,
  collectionGroup,
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
    const ref = doc(db, "inventory", sku.trim().toUpperCase());
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

  async completeOrder(
    orderId: string,
    items: { sku: string; qty: number; name?: string }[],
    memo: string = ""
  ) {
    try {
      const unmatchedItems: {
        sku?: string;
        name?: string;
        qty: number;
        reason: string;
      }[] = [];

      for (const item of items) {
        const normalizedSku = item.sku.trim().toUpperCase();
        const qty = Number(item.qty) || 0;

        // 🔴 SKU가 비어있는 경우 ("" 등) → 재고 차감 시도하지 않고 미매칭 처리
        if (!normalizedSku) {
          unmatchedItems.push({
            sku: "",
            name: item.name || "제품명 없음",
            qty,
            reason: "EMPTY_SKU"
          });
          continue;
        }

        const productRef = doc(db, "inventory", normalizedSku);
        const productSnap = await getDoc(productRef);

        // 🔴 SKU 문서가 존재하지 않으면 재고 차감하지 않고 검토 대상으로 분류
        if (!productSnap.exists()) {
          unmatchedItems.push({
            sku: normalizedSku,
            name: item.name || "(재고 미등록 상품)",
            qty,
            reason: "SKU_NOT_FOUND"
          });
          continue;
        }

        // 🔥 재고 부족이어도 막지 않고 그대로 차감 (마이너스 허용)
        await updateDoc(productRef, {
          stock: increment(-qty)
        });
      }

      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data() || {};

      // 🔹 shipments 미리 조회 (중복 쿼리 방지)
      const shipmentsSnap = await getDocs(
        collection(db, "orders", orderId, "shipments")
      );

      // 첫 번째 shipment 데이터 추출
      const firstShipment = !shipmentsSnap.empty 
        ? (shipmentsSnap.docs[0].data() as any) 
        : null;

      // 🔥 trackingNumber 결정 (order → shipment 순서)
      const trackingNumber =
        orderData.tracking ||
        orderData.trackingNumber ||
        firstShipment?.trackingNumber ||
        firstShipment?.tracking ||
        "";

      // 🔥 deliveryType 결정 (order → shipment → fallback 순서)
      let deliveryType = orderData.deliveryType;

      if (!deliveryType && firstShipment) {
        deliveryType = firstShipment.deliveryType || firstShipment.type;
      }

      if (!deliveryType) {
        deliveryType = trackingNumber ? "POST" : "PICKUP";
      }

      const productNames = (
        await Promise.all(
          items.map(async (item) => {
            const normalizedSku = (item.sku || "").trim().toUpperCase();

            if (!normalizedSku) return "";

            const productRef = doc(db, "inventory", normalizedSku);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) return "";

            const productData = productSnap.data() || {};
            return productData.name || "";
          })
        )
      ).join(" ");

      const productNameTokens = productNames
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      let resolvedCustomerName =
        orderData.name ||
        orderData.customerName ||
        orderData.buyerName ||
        orderData.receiverName ||
        "";

      // order 문서에 이름이 없으면 shipment에서 다시 확인
      if (!resolvedCustomerName && firstShipment) {
        resolvedCustomerName =
          firstShipment.name ||
          firstShipment.customerName ||
          firstShipment.buyerName ||
          firstShipment.receiverName ||
          firstShipment.receiver ||
          "";
      }

      await addDoc(collection(db, "logs"), {
        type: deliveryType,
        deliveryType: deliveryType,
        orderId,
        operator:
          (typeof window !== "undefined" &&
            window.localStorage &&
            localStorage.getItem("operatorName")) ||
          "Unknown",
        customerName: resolvedCustomerName,
        customerNameLower: resolvedCustomerName.toLowerCase(),
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
        trackingNumber: trackingNumber,
        memo: memo || "",
        needsReview: unmatchedItems.length > 0,
        unmatchedItems: unmatchedItems,
        createdAt: serverTimestamp(),
        items: await Promise.all(
          items.map(async (item) => {
            const normalizedSku = (item.sku || "").trim().toUpperCase();

            if (!normalizedSku) {
              return {
                sku: "",
                name: "",
                quantity: item.qty,
                link: ""
              };
            }

            const productRef = doc(db, "inventory", normalizedSku);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) {
              return {
                sku: normalizedSku,
                name: "",
                quantity: item.qty,
                link: ""
              };
            }

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

      // 🔹 해당 주문의 모든 shipment도 완료 처리 (아웃바운드 목록에서 사라지도록)
      const batch = writeBatch(db);

      shipmentsSnap.docs.forEach((shipmentDoc) => {
        batch.set(
          shipmentDoc.ref,
          {
            status: "COMPLETED",
            completedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      // 주문 상태도 완료로 변경
      batch.set(
        orderRef,
        {
          status: "COMPLETED",
          completedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();

      return true;
    } catch (error) {
      console.error("출고 처리 실패:", error);
      return false;
    }
  }

  async getOrderByTracking(trackingNumber: string) {
    const q = query(
      collectionGroup(db, "shipments"),
      where("tracking", "==", trackingNumber)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const data: any = docSnap.data();

    // parent orderId 추출 (orders/{orderId}/shipments/{shipmentId})
    const orderRef = docSnap.ref.parent.parent;
    const orderId = orderRef ? orderRef.id : "";

    return {
      orderId,
      shipmentId: docSnap.id,
      ...data
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

      // SKU 미매칭 상태가 기본 목록에서도 보이도록 needsReview/unmatchedItems 포함
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
        memo: data.memo || "",
        needsReview: data.needsReview || false,
        unmatchedItems: data.unmatchedItems || [],
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
    const normalizedTracking = (trackingNumber || "").trim();
    let q;

    if (lastDoc) {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("trackingNumber", "==", normalizedTracking),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("trackingNumber", "==", normalizedTracking),
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
  // 🔍 SKU / 상품명 자동완성 검색 (Logs 수동 매칭용)
  async searchInventory(keyword: string, limitCount: number = 10) {
    const trimmed = keyword.trim().toUpperCase();
    if (!trimmed) return [];

    const snapshot = await getDocs(collection(db, "inventory"));

    const results = snapshot.docs
      .map((docSnap) => {
        const data: any = docSnap.data();
        return {
          sku: docSnap.id,
          name: data.name || "",
          stock: data.stock || 0
        };
      })
      .filter((item) => {
        return (
          item.sku.includes(trimmed) ||
          item.name.toUpperCase().includes(trimmed)
        );
      })
      .slice(0, limitCount);

    return results;
  }
  // 🔧 SKU 미매칭 항목을 기존 상품에 연결 (관리자 수동 매칭)
  async linkUnmatchedItem(
    logId: string,
    unmatchedIndex: number,
    targetSku: string
  ) {
    try {
      const logRef = doc(db, "logs", logId);
      const logSnap = await getDoc(logRef);

      if (!logSnap.exists()) {
        throw new Error("로그 문서를 찾을 수 없습니다.");
      }

      const logData: any = logSnap.data();
      const unmatchedItems = logData.unmatchedItems || [];

      if (!unmatchedItems[unmatchedIndex]) {
        throw new Error("유효하지 않은 미매칭 인덱스입니다.");
      }

      const item = unmatchedItems[unmatchedIndex];
      const normalizedSku = targetSku.trim().toUpperCase();

      // 🔹 inventory 문서 존재 확인
      const productRef = doc(db, "inventory", normalizedSku);
      const productSnap = await getDoc(productRef);

      if (!productSnap.exists()) {
        throw new Error("연결할 SKU가 존재하지 않습니다.");
      }

      // 🔹 재고 차감 실행
      await updateDoc(productRef, {
        stock: increment(-Number(item.qty || 0))
      });

      // 🔹 로그의 items 배열에도 실제 상품 정보 반영 (제품명이 빈칸으로 보이는 문제 방지)
      const items = logData.items || [];

      const productData: any = productSnap.data() || {};
      const productName = productData.name || "";
      const productLink = productData.link || "";

      // 기존 items 중 SKU가 비어있는 항목 찾아 업데이트
      let updated = false;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.sku) {
          items[i] = {
            sku: normalizedSku,
            name: productName,
            quantity: it.quantity ?? item.qty,
            link: productLink
          };
          updated = true;
          break;
        }
      }

      // 혹시 비어있는 항목이 없으면 새로 추가
      if (!updated) {
        items.push({
          sku: normalizedSku,
          name: productName,
          quantity: item.qty,
          link: productLink
        });
      }

      // 🔹 unmatchedItems에서 제거
      unmatchedItems.splice(unmatchedIndex, 1);

      await updateDoc(logRef, {
        items,
        unmatchedItems,
        needsReview: unmatchedItems.length > 0,
        updatedAt: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error("SKU 수동 매칭 실패:", error);
      return false;
    }
  }
  // 🔗 방문수령 주문 병합 (여러 주문을 하나로 묶기)
  async mergePickupOrders(orderIds: string[]) {
    try {
      if (!orderIds || orderIds.length < 2) {
        throw new Error("병합할 주문이 2개 이상 필요합니다.");
      }

      const primaryOrderId = orderIds[0];
      const primaryRef = doc(db, "orders", primaryOrderId);
      const primarySnap = await getDoc(primaryRef);

      if (!primarySnap.exists()) {
        await setDoc(primaryRef, {
          createdAt: serverTimestamp(),
          status: "READY"
        }, { merge: true });
      }

      let mergedItems: any[] = [];
      let mergedTotalPrice = 0;

      const batch = writeBatch(db);

      // 🔹 모든 주문 순회
      for (const orderId of orderIds) {
        const orderRef = doc(db, "orders", orderId);

        // shipments 가져오기
        const shipmentsSnap = await getDocs(
          collection(db, "orders", orderId, "shipments")
        );

        for (const shipmentDoc of shipmentsSnap.docs) {
          const shipmentData: any = shipmentDoc.data() || {};
          const shipmentItems = shipmentData.items || [];

          // Add sourceOrderId to each item, keep context
          const itemsWithSource = shipmentItems.map((item: any) => ({
            ...item,
            sourceOrderId: orderId
          }));

          mergedItems = [...mergedItems, ...itemsWithSource];

          mergedTotalPrice += Number(shipmentData.total_price || 0);

          // 🔹 shipment ID 충돌 방지
          const newShipmentRef =
            orderId === primaryOrderId
              ? doc(db, "orders", primaryOrderId, "shipments", shipmentDoc.id)
              : doc(collection(db, "orders", primaryOrderId, "shipments"));

          const newShipmentData = {
            ...shipmentData,
            items: itemsWithSource
          };

          // primary 주문이면 shipment 업데이트만
          if (orderId === primaryOrderId) {
            batch.set(newShipmentRef, newShipmentData, { merge: true });
          } else {
            // 다른 주문이면 primary로 이동
            batch.set(newShipmentRef, newShipmentData);
            batch.delete(shipmentDoc.ref);
          }
        }

        // 병합된 주문 상태 표시
        if (orderId !== primaryOrderId) {
          batch.set(orderRef, {
            status: "MERGED",
            mergedInto: primaryOrderId,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }

      // primary 주문 업데이트 (add mergedOrderIds for UI context)
      batch.set(primaryRef, {
        items: mergedItems,
        total_price: mergedTotalPrice,
        status: "READY",
        mergedOrderIds: orderIds,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();

      return true;
    } catch (error) {
      console.error("방문수령 주문 병합 실패:", error);
      return false;
    }
  }

  // 🔄 방문수령 주문 병합 취소
  async unmergePickupOrders(primaryOrderId: string) {
    try {
      const primaryRef = doc(db, "orders", primaryOrderId);
      const primarySnap = await getDoc(primaryRef);

      if (!primarySnap.exists()) {
        throw new Error("Primary order not found");
      }

      const data: any = primarySnap.data() || {};
      const mergedOrderIds: string[] = data.mergedOrderIds || [];

      if (!mergedOrderIds || mergedOrderIds.length < 2) {
        return true;
      }

      const batch = writeBatch(db);

      // 🔹 primary 주문의 shipments 읽기
      const shipmentsSnap = await getDocs(
        collection(db, "orders", primaryOrderId, "shipments")
      );

      for (const shipmentDoc of shipmentsSnap.docs) {
        const shipmentData: any = shipmentDoc.data() || {};
        const items = shipmentData.items || [];
        // safety guard: if shipment has no items skip it (prevents deleting data accidentally)
        if (!Array.isArray(items) || items.length === 0) {
          continue;
        }

        // sourceOrderId 기준으로 분리
        const itemsByOrder: Record<string, any[]> = {};

        items.forEach((item: any) => {
          // if sourceOrderId is missing (older merged data), treat it as the shipment's original order
          const source = item.sourceOrderId ?? primaryOrderId;
          if (!itemsByOrder[source]) itemsByOrder[source] = [];
          // Remove sourceOrderId field instead of setting undefined (Firestore does not allow undefined)
          const { sourceOrderId, ...rest } = item;
          itemsByOrder[source].push(rest);
        });

        // 각 주문으로 shipment 복구
        for (const orderId of Object.keys(itemsByOrder)) {
          const orderItems = itemsByOrder[orderId];
          const newShipmentRef = doc(
            collection(db, "orders", orderId, "shipments")
          );

          // Preserve original shipment metadata
          const restoredShipmentData = {
            ...shipmentData,
            items: orderItems,
            total_price: orderItems.reduce(
              (sum, i) => sum + Number(i.subtotal || 0),
              0
            ),
            restoredAt: serverTimestamp()
          };

          batch.set(newShipmentRef, restoredShipmentData);
        }

        // delete only if this shipment was originally merged into primary
        if (shipmentDoc.ref.parent.parent?.id === primaryOrderId) {
          batch.delete(shipmentDoc.ref);
        }
      }

      // 🔹 모든 주문 상태 복구
      for (const orderId of mergedOrderIds) {
        const ref = doc(db, "orders", orderId);

        batch.set(
          ref,
          {
            status: "READY",
            mergedInto: null,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
        // ensure order items are not left empty if shipments were restored
        // (orders UI often reads items from order doc)
      }

      // 🔹 primary 병합 정보 제거 (items / total_price는 shipment 기반으로 다시 계산되므로 삭제하지 않음)
      batch.set(
        primaryRef,
        {
          mergedOrderIds: [],
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();

      return true;
    } catch (error) {
      console.error("방문수령 병합 취소 실패:", error);
      return false;
    }
  }
}

export const inventoryService = new InventoryService();