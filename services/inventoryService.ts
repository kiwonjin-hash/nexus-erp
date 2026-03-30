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

  private normalizeUnmatchedText(value: string) {
    return (value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private stripPickupDisplaySuffix(value: string) {
    return (value || "")
      .replace(/\s+/g, "")
      .replace(/[_-]\d{3,4}(?:-\d+)?$/, "")
      .trim();
  }

  private normalizePickupName(value: string) {
    return this.stripPickupDisplaySuffix(value);
  }

  private normalizePhoneDigits(value: string) {
    return (value || "")
      .replace(/\D/g, "")
      .trim();
  }

  private getPhoneLast4(value: string) {
    const digits = this.normalizePhoneDigits(value);
    return digits.length >= 4 ? digits.slice(-4) : "";
  }

  private buildPickupCustomerKey(customerName: string, phone: string) {
    const safeName = this.normalizePickupName(customerName);
    const phoneLast4 = this.getPhoneLast4(phone);
    return [safeName, phoneLast4].filter(Boolean).join("_");
  }

  private normalizeTrackingNumber(value: string) {
    return (value || "")
      .replace(/\D/g, "")
      .trim();
  }

  private extractTrackingNumbersFromValue(value: any) {
    if (Array.isArray(value)) {
      return [...new Set(
        value
          .map((entry) => this.normalizeTrackingNumber(String(entry || "")))
          .filter(Boolean)
      )];
    }

    return [...new Set(
      String(value || "")
        .split(/[\n,\/|]+/)
        .map((entry) => this.normalizeTrackingNumber(entry))
        .filter(Boolean)
    )];
  }

  private getAllTrackingNumbers(orderData: any, shipmentDocs: any[] = []) {
    const trackingNumbers = new Set<string>();

    const appendFromValue = (value: any) => {
      this.extractTrackingNumbersFromValue(value).forEach((tracking) => {
        trackingNumbers.add(tracking);
      });
    };

    appendFromValue(orderData?.tracking);
    appendFromValue(orderData?.trackingNumber);
    appendFromValue(orderData?.trackingNumbers);

    shipmentDocs.forEach((shipmentDoc: any) => {
      const shipmentData = typeof shipmentDoc?.data === "function"
        ? shipmentDoc.data() || {}
        : shipmentDoc || {};

      appendFromValue(shipmentData?.tracking);
      appendFromValue(shipmentData?.trackingNumber);
      appendFromValue(shipmentData?.trackingNumbers);
    });

    return Array.from(trackingNumbers);
  }

  private findMatchedShipmentData(
    shipmentDocs: any[] = [],
    candidateTrackingNumbers: string[] = []
  ) {
    const normalizedCandidates = [...new Set(
      (candidateTrackingNumbers || [])
        .map((value) => this.normalizeTrackingNumber(String(value || "")))
        .filter(Boolean)
    )];

    const normalizedShipmentDocs = shipmentDocs.map((shipmentDoc: any) => ({
      doc: shipmentDoc,
      data:
        typeof shipmentDoc?.data === "function"
          ? shipmentDoc.data() || {}
          : shipmentDoc || {}
    }));

    if (normalizedCandidates.length === 0) {
      return normalizedShipmentDocs[0] || null;
    }

    for (const shipmentEntry of normalizedShipmentDocs) {
      const shipmentTrackingNumbers = [
        ...new Set([
          ...this.extractTrackingNumbersFromValue(shipmentEntry.data?.trackingNumbers),
          ...this.extractTrackingNumbersFromValue(shipmentEntry.data?.trackingNumber),
          ...this.extractTrackingNumbersFromValue(shipmentEntry.data?.tracking)
        ])
      ];

      if (shipmentTrackingNumbers.some((value) => normalizedCandidates.includes(value))) {
        return shipmentEntry;
      }
    }

    return normalizedShipmentDocs[0] || null;
  }

  private formatPickupCode(
    customerName: string,
    phone: string,
    baseDate: Date = new Date()
  ) {
    const safeCustomerName = this.normalizePickupName(customerName) || "방문수령";
    const month = String(baseDate.getMonth() + 1).padStart(2, "0");
    const day = String(baseDate.getDate()).padStart(2, "0");
    return `${safeCustomerName}-${month}${day}`;
  }

  private formatPickupItemsText(
    items: { sku?: string; qty?: number; quantity?: number; name?: string }[]
  ) {
    return (items || [])
      .map((item) => {
        const productName = (item?.name || "").trim();
        const qty = Number(item?.qty ?? item?.quantity ?? 0) || 0;
        return productName ? `${productName} x${qty}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  private async syncPickupToSheet(params: {
    orderId: string;
    customerName: string;
    phone: string;
    itemsText: string;
    pickupCode: string;
  }) {
    const webhookUrl = import.meta.env.VITE_PICKUP_SHEET_WEBHOOK_URL;
    console.log("pickup webhookUrl:", webhookUrl);

    if (!webhookUrl) {
      console.warn("방문수령 시트 웹훅 URL이 설정되지 않았습니다.");
      return false;
    }

    console.log("pickup payload:", {
      pickupCode: params.pickupCode,
      name: params.customerName,
      phone: params.phone,
      itemsText: params.itemsText,
      orderNo: params.orderId
    });

    await fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        pickupCode: params.pickupCode,
        name: params.customerName,
        phone: params.phone,
        itemsText: params.itemsText,
        orderNo: params.orderId
      })
    });

    return true;
  }

  private replaceUnmatchedPlaceholderItem(
    items: any[],
    targetQty: number,
    normalizedSku: string,
    productName: string,
    productLink: string
  ) {
    for (let i = 0; i < items.length; i++) {
      const current = items[i] || {};
      const currentSku = current.sku || "";
      const currentQty = Number(current.quantity || 0);

      if (
        (!currentSku || currentSku.startsWith("UNMATCHED_")) &&
        currentQty === Number(targetQty || 0)
      ) {
        items[i] = {
          sku: normalizedSku,
          name: productName,
          quantity: current.quantity ?? targetQty,
          link: productLink
        };
        return true;
      }
    }

    for (let i = 0; i < items.length; i++) {
      const current = items[i] || {};
      const currentSku = current.sku || "";

      if (!currentSku || currentSku.startsWith("UNMATCHED_")) {
        items[i] = {
          sku: normalizedSku,
          name: productName,
          quantity: current.quantity ?? targetQty,
          link: productLink
        };
        return true;
      }
    }

    items.push({
      sku: normalizedSku,
      name: productName,
      quantity: targetQty,
      link: productLink
    });

    return true;
  }

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
    items: { sku: string; qty: number; name?: string; sourceOrderId?: string }[],
    memo: string = "",
    options?: {
      deliveryType?: "POST" | "VALEX" | "PICKUP" | string;
      tracking?: string;
      trackingNumbers?: string[];
    }
  ) {
    try {
      const unmatchedItems: {
        sku?: string;
        name?: string;
        qty: number;
        reason: string;
      }[] = [];

      for (const item of items) {
        const normalizedSku = String(item?.sku || "")
          .trim()
          .toUpperCase();
        const qty = Number(item?.qty ?? 0);

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

        // 🔴 수량이 0 이하이거나 숫자가 아니면 재고 차감하지 않고 검토 대상으로 분류
        if (!Number.isFinite(qty) || qty <= 0) {
          unmatchedItems.push({
            sku: normalizedSku,
            name: item.name || "(수량 오류 상품)",
            qty: Number.isFinite(qty) ? qty : 0,
            reason: "INVALID_QTY"
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

        console.log("재고 차감 실행", {
          orderId,
          sku: normalizedSku,
          qty
        });

        // 🔥 재고 부족이어도 막지 않고 그대로 차감 (마이너스 허용)
        await updateDoc(productRef, {
          stock: increment(-qty),
          lastUpdated: serverTimestamp()
        });
      }

      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data() || {};

      // 🔹 shipments 미리 조회 (중복 쿼리 방지)
      const shipmentsSnap = await getDocs(
        collection(db, "orders", orderId, "shipments")
      );

      const optionTrackingNumbers = [
        ...new Set([
          ...this.extractTrackingNumbersFromValue(options?.trackingNumbers),
          ...this.extractTrackingNumbersFromValue(options?.tracking)
        ])
      ];

      // 현재 outbound에서 선택한 송장 기준으로 가장 잘 맞는 shipment 우선 선택
      const matchedShipmentEntry = this.findMatchedShipmentData(
        shipmentsSnap.docs,
        optionTrackingNumbers
      );
      const matchedShipment = matchedShipmentEntry?.data || null;

      // 🔥 trackingNumber / trackingNumbers 결정 (outbound 전달값 → order + shipment 순서)
      const trackingNumbers = [
        ...new Set([
          ...optionTrackingNumbers,
          ...this.getAllTrackingNumbers(orderData, shipmentsSnap.docs)
        ])
      ];
      const trackingNumber = trackingNumbers[0] || "";

      // 🔥 deliveryType 결정 (outbound 전달값 → order → matched shipment → fallback 순서)
      let deliveryType = options?.deliveryType || orderData.deliveryType;

      if (!deliveryType && matchedShipment) {
        deliveryType = matchedShipment.deliveryType || matchedShipment.type;
      }

      if (!deliveryType) {
        deliveryType = trackingNumber ? "POST" : "PICKUP";
      }

      const productNames = (
        await Promise.all(
          items.map(async (item) => {
            const normalizedSku = String(item?.sku || "").trim().toUpperCase();

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
      if (!resolvedCustomerName && matchedShipment) {
        resolvedCustomerName =
          matchedShipment.name ||
          matchedShipment.customerName ||
          matchedShipment.buyerName ||
          matchedShipment.receiverName ||
          matchedShipment.receiver ||
          "";
      }

      let resolvedPhone =
        orderData.phone ||
        orderData.customerPhone ||
        orderData.buyerPhone ||
        orderData.receiverPhone ||
        orderData.tel ||
        orderData.mobile ||
        "";

      if (!resolvedPhone && matchedShipment) {
        resolvedPhone =
          matchedShipment.phone ||
          matchedShipment.customerPhone ||
          matchedShipment.buyerPhone ||
          matchedShipment.receiverPhone ||
          matchedShipment.tel ||
          matchedShipment.mobile ||
          "";
      }

      const mergedOrderIds = Array.isArray(orderData.mergedOrderIds)
        ? orderData.mergedOrderIds.map((id: any) => String(id || "").trim()).filter(Boolean)
        : [];

      const pickupDisplayCustomerName = this.stripPickupDisplaySuffix(
        resolvedCustomerName
      );

      const pickupCustomerKey = this.buildPickupCustomerKey(
        resolvedCustomerName,
        resolvedPhone
      );

      const resolvedItems = await Promise.all(
        items.map(async (item, idx) => {
          const normalizedSku = String(item?.sku || "").trim().toUpperCase();
          const normalizedQty = Number(item?.qty ?? 0) || 0;

          if (!normalizedSku) {
            return {
              sku: `UNMATCHED_${idx}`,
              originalSku: "",
              name: item.name || "",
              quantity: normalizedQty,
              link: "",
              sourceOrderId: item.sourceOrderId || orderId
            };
          }

          const productRef = doc(db, "inventory", normalizedSku);
          const productSnap = await getDoc(productRef);

          if (!productSnap.exists()) {
            return {
              sku: `UNMATCHED_${idx}`,
              originalSku: normalizedSku,
              name: item.name || "",
              quantity: normalizedQty,
              link: "",
              sourceOrderId: item.sourceOrderId || orderId
            };
          }

          const productData = productSnap.data() || {};
          const productName = productData.name || item.name || "";
          const productLink = productData.link || "";

          return {
            sku: normalizedSku,
            name: productName,
            quantity: normalizedQty,
            link: productLink,
            sourceOrderId: item.sourceOrderId || orderId
          };
        })
      );

      await addDoc(collection(db, "logs"), {
        type: deliveryType,
        deliveryType: deliveryType,
        orderId,
        mergedOrderIds,
        operator:
          (typeof window !== "undefined" &&
            window.localStorage &&
            localStorage.getItem("operatorName")) ||
          "Unknown",
        customerName: resolvedCustomerName,
        customerNameLower: resolvedCustomerName.toLowerCase(),
        customerPhone: resolvedPhone,
        customerPhoneLast4: this.getPhoneLast4(resolvedPhone),
        pickupCustomerKey,
        skuList: items.map(item => String(item?.sku || "").trim().toUpperCase()).filter(Boolean),
        productNameTokens,
        searchableText: (
          productNames +
          " " +
          orderId +
          " " +
          mergedOrderIds.join(" ") +
          " " +
          (orderData.name || "") +
          " " +
          resolvedCustomerName +
          " " +
          resolvedPhone +
          " " +
          trackingNumbers.join(" ") +
          " " +
          items.map(item => String(item?.sku || "")).join(" ")
        ).toLowerCase(),
        trackingNumber: trackingNumbers.join(","),
        trackingNumbers,
        memo: memo || "",
        needsReview: unmatchedItems.length > 0,
        unmatchedItems: unmatchedItems,
        requestedItems: items.map(item => ({
          sku: String(item?.sku || "").trim().toUpperCase(),
          qty: Number(item?.qty ?? 0) || 0,
          name: item?.name || "",
          sourceOrderId: item?.sourceOrderId || orderId
        })),
        createdAt: serverTimestamp(),
        items: resolvedItems
      });

      if (deliveryType === "PICKUP") {
        try {
          const pickupCode = this.formatPickupCode(
            pickupDisplayCustomerName,
            resolvedPhone,
            new Date()
          );
          const pickupItemsText = this.formatPickupItemsText(resolvedItems);

          await this.syncPickupToSheet({
            orderId,
            customerName: pickupDisplayCustomerName,
            phone: resolvedPhone,
            itemsText: pickupItemsText,
            pickupCode
          });
        } catch (pickupSyncError) {
          console.error("방문수령 시트 동기화 실패:", pickupSyncError);
        }
      }

      // 🔹 출고 완료 시 같은 주문 아래 READY 상태 shipment들을 함께 정리
      const batch = writeBatch(db);

      const normalizedTrackingNumbers = [
        ...new Set(
          trackingNumbers
            .map((value) => this.normalizeTrackingNumber(String(value || "")))
            .filter(Boolean)
        )
      ];

      const shipmentDocsToComplete = new Map<string, any>();

      shipmentsSnap.docs.forEach((shipmentDoc) => {
        const shipmentData: any = shipmentDoc.data() || {};
        const shipmentStatus = String(shipmentData?.status || "").trim().toUpperCase();

        if (shipmentStatus === "COMPLETED" || shipmentStatus === "MERGED") {
          return;
        }

        const shipmentTrackingNumbers = [
          ...new Set([
            ...this.extractTrackingNumbersFromValue(shipmentData?.trackingNumbers),
            ...this.extractTrackingNumbersFromValue(shipmentData?.trackingNumber),
            ...this.extractTrackingNumbersFromValue(shipmentData?.tracking)
          ])
        ];

        const hasMatchedTracking =
          normalizedTrackingNumbers.length === 0 ||
          shipmentTrackingNumbers.some((value) => normalizedTrackingNumbers.includes(value));

        const sameDeliveryType =
          !deliveryType ||
          shipmentData?.deliveryType === deliveryType ||
          shipmentData?.type === deliveryType;

        if (hasMatchedTracking || sameDeliveryType) {
          shipmentDocsToComplete.set(shipmentDoc.ref.path, shipmentDoc);
        }
      });

      if (matchedShipmentEntry?.doc?.ref) {
        shipmentDocsToComplete.set(matchedShipmentEntry.doc.ref.path, matchedShipmentEntry.doc);
      }

      if (shipmentDocsToComplete.size === 0) {
        shipmentsSnap.docs.forEach((shipmentDoc) => {
          const shipmentData: any = shipmentDoc.data() || {};
          const shipmentStatus = String(shipmentData?.status || "").trim().toUpperCase();

          if (shipmentStatus === "COMPLETED" || shipmentStatus === "MERGED") {
            return;
          }

          shipmentDocsToComplete.set(shipmentDoc.ref.path, shipmentDoc);
        });
      }

      shipmentDocsToComplete.forEach((shipmentDoc: any) => {
        batch.set(
          shipmentDoc.ref,
          {
            status: "COMPLETED",
            deliveryType,
            tracking: trackingNumber,
            trackingNumbers,
            completedAt: serverTimestamp(),
            isCompleted: true,
            pickupReady: false,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      // 주문 상태도 완료로 변경
      batch.set(
        orderRef,
        {
          status: "COMPLETED",
          deliveryType,
          tracking: trackingNumber,
          trackingNumbers,
          completedAt: serverTimestamp(),
          isCompleted: true,
          pickupReady: false,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      console.log("출고 완료 상태 반영", {
        orderId,
        deliveryType,
        trackingNumber,
        trackingNumbers,
        completedShipmentCount: shipmentDocsToComplete.size,
        completedShipmentPaths: Array.from(shipmentDocsToComplete.keys())
      });

      await batch.commit();

      return true;
    } catch (error) {
      console.error("출고 처리 실패:", error);
      return false;
    }
  }

  async getOrderByTracking(trackingNumber: string) {
    const normalizedTracking = this.normalizeTrackingNumber(trackingNumber || "");

    if (!normalizedTracking) return null;

    const [arraySnapshot, legacySnapshot] = await Promise.all([
      getDocs(
        query(
          collectionGroup(db, "shipments"),
          where("trackingNumbers", "array-contains", normalizedTracking),
          limit(1)
        )
      ),
      getDocs(
        query(
          collectionGroup(db, "shipments"),
          where("tracking", "==", normalizedTracking),
          limit(1)
        )
      )
    ]);

    const docSnap = arraySnapshot.docs[0] || legacySnapshot.docs[0];
    if (!docSnap) return null;

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
        trackingNumbers: Array.isArray(data.trackingNumbers)
          ? data.trackingNumbers
          : this.extractTrackingNumbersFromValue(data.trackingNumber),
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
    const normalizedOrderId = String(orderId || "").trim();

    if (!normalizedOrderId) {
      return [] as any;
    }

    const buildPrimaryQuery = (cursor?: QueryDocumentSnapshot<DocumentData>) => {
      if (cursor) {
        return query(
          collection(db, "logs"),
          where("type", "in", ["POST", "VALEX", "PICKUP"]),
          where("orderId", "==", normalizedOrderId),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(limitCount)
        );
      }

      return query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("orderId", "==", normalizedOrderId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    };

    const buildMergedQuery = (cursor?: QueryDocumentSnapshot<DocumentData>) => {
      if (cursor) {
        return query(
          collection(db, "logs"),
          where("type", "in", ["POST", "VALEX", "PICKUP"]),
          where("mergedOrderIds", "array-contains", normalizedOrderId),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(limitCount)
        );
      }

      return query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("mergedOrderIds", "array-contains", normalizedOrderId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    };

    const [primarySnapshot, mergedSnapshot] = await Promise.all([
      getDocs(buildPrimaryQuery(lastDoc)),
      getDocs(buildMergedQuery(lastDoc))
    ]);

    const mergedDocs = new Map<string, any>();

    [...primarySnapshot.docs, ...mergedSnapshot.docs].forEach((docSnap) => {
      if (!mergedDocs.has(docSnap.id)) {
        mergedDocs.set(docSnap.id, {
          id: docSnap.id,
          ...docSnap.data()
        });
      }
    });

    const logs: any[] = Array.from(mergedDocs.values())
      .sort((a: any, b: any) => {
        const aSeconds = a.createdAt?.seconds || 0;
        const bSeconds = b.createdAt?.seconds || 0;
        return bSeconds - aSeconds;
      })
      .slice(0, limitCount);

    (logs as any).lastVisible =
      primarySnapshot.docs[primarySnapshot.docs.length - 1] ||
      mergedSnapshot.docs[mergedSnapshot.docs.length - 1] ||
      null;

    return logs;
  }

  // 🔎 송장번호 검색
  async searchByTracking(
    trackingNumber: string,
    limitCount: number = 50,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ) {
    const normalizedTracking = this.normalizeTrackingNumber(trackingNumber || "");

    if (!normalizedTracking) {
      return [] as any;
    }

    const buildArrayQuery = (cursor?: QueryDocumentSnapshot<DocumentData>) => {
      if (cursor) {
        return query(
          collection(db, "logs"),
          where("type", "in", ["POST", "VALEX", "PICKUP"]),
          where("trackingNumbers", "array-contains", normalizedTracking),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(limitCount)
        );
      }

      return query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("trackingNumbers", "array-contains", normalizedTracking),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    };

    const buildLegacyQuery = (cursor?: QueryDocumentSnapshot<DocumentData>) => {
      if (cursor) {
        return query(
          collection(db, "logs"),
          where("type", "in", ["POST", "VALEX", "PICKUP"]),
          where("trackingNumber", "==", normalizedTracking),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(limitCount)
        );
      }

      return query(
        collection(db, "logs"),
        where("type", "in", ["POST", "VALEX", "PICKUP"]),
        where("trackingNumber", "==", normalizedTracking),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
    };

    const [arraySnapshot, legacySnapshot] = await Promise.all([
      getDocs(buildArrayQuery(lastDoc)),
      getDocs(buildLegacyQuery(lastDoc))
    ]);

    const mergedDocs = new Map<string, any>();

    [...arraySnapshot.docs, ...legacySnapshot.docs].forEach((docSnap) => {
      if (!mergedDocs.has(docSnap.id)) {
        mergedDocs.set(docSnap.id, {
          id: docSnap.id,
          ...docSnap.data()
        });
      }
    });

    const logs: any[] = Array.from(mergedDocs.values()).sort((a: any, b: any) => {
      const aSeconds = a.createdAt?.seconds || 0;
      const bSeconds = b.createdAt?.seconds || 0;
      return bSeconds - aSeconds;
    }).slice(0, limitCount);

    (logs as any).lastVisible =
      arraySnapshot.docs[arraySnapshot.docs.length - 1] ||
      legacySnapshot.docs[legacySnapshot.docs.length - 1] ||
      null;

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

      const trackingNumbers = this.getAllTrackingNumbers(data, []);

      const searchableText = (
        productNames +
        " " +
        (data.orderId || "") +
        " " +
        (data.customerName || "") +
        " " +
        trackingNumbers.join(" ") +
        " " +
        skuList.join(" ")
      ).toLowerCase();

      batch.update(docSnap.ref, {
        skuList,
        customerNameLower,
        searchableText,
        productNameTokens,
        trackingNumbers,
        trackingNumber: trackingNumbers.length > 0
          ? trackingNumbers.join(",")
          : (data.trackingNumber || "")
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

      this.replaceUnmatchedPlaceholderItem(
        items,
        Number(item.qty || 0),
        normalizedSku,
        productName,
        productLink
      );

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

  // 🔧 SKU 미매칭 항목 일괄 매칭
  async bulkLinkUnmatchedItems(params: {
    targetSku: string;
    matchName?: string;
    originalSku?: string;
    limitCount?: number;
    dryRun?: boolean;
  }) {
    try {
      const normalizedSku = (params.targetSku || "").trim().toUpperCase();
      const normalizedMatchName = this.normalizeUnmatchedText(
        params.matchName || ""
      );
      const normalizedOriginalSku = (params.originalSku || "")
        .trim()
        .toUpperCase();
      const limitCount = Math.min(Number(params.limitCount || 200), 400);
      const dryRun = Boolean(params.dryRun);

      if (!normalizedSku) {
        throw new Error("대상 SKU가 비어 있습니다.");
      }

      if (!normalizedMatchName && !normalizedOriginalSku) {
        throw new Error("matchName 또는 originalSku 중 하나는 필요합니다.");
      }

      const productRef = doc(db, "inventory", normalizedSku);
      const productSnap = await getDoc(productRef);

      if (!productSnap.exists()) {
        throw new Error("연결할 SKU가 존재하지 않습니다.");
      }

      const productData: any = productSnap.data() || {};
      const productName = productData.name || "";
      const productLink = productData.link || "";

      const logsQuery = query(
        collection(db, "logs"),
        where("needsReview", "==", true),
        limit(limitCount)
      );

      const snapshot = await getDocs(logsQuery);

      const matchedTargets: {
        logRef: any;
        items: any[];
        unmatchedItems: any[];
        matchedQty: number;
        matchedCount: number;
      }[] = [];

      let totalMatchedQty = 0;
      let totalMatchedCount = 0;

      snapshot.docs.forEach((docSnap) => {
        const data: any = docSnap.data() || {};
        const unmatchedItems = Array.isArray(data.unmatchedItems)
          ? [...data.unmatchedItems]
          : [];

        if (unmatchedItems.length === 0) return;

        const items = Array.isArray(data.items) ? [...data.items] : [];
        const remained: any[] = [];
        let matchedQty = 0;
        let matchedCount = 0;

        unmatchedItems.forEach((unmatched: any) => {
          const unmatchedName = this.normalizeUnmatchedText(
            unmatched.name || ""
          );
          const unmatchedSku = (unmatched.sku || "").trim().toUpperCase();
          const qty = Number(unmatched.qty || 0);

          const isNameMatch =
            normalizedMatchName && unmatchedName === normalizedMatchName;
          const isSkuMatch =
            normalizedOriginalSku && unmatchedSku === normalizedOriginalSku;

          if (isNameMatch || isSkuMatch) {
            matchedQty += qty;
            matchedCount += 1;
            this.replaceUnmatchedPlaceholderItem(
              items,
              qty,
              normalizedSku,
              productName,
              productLink
            );
          } else {
            remained.push(unmatched);
          }
        });

        if (matchedCount > 0) {
          matchedTargets.push({
            logRef: docSnap.ref,
            items,
            unmatchedItems: remained,
            matchedQty,
            matchedCount
          });
          totalMatchedQty += matchedQty;
          totalMatchedCount += matchedCount;
        }
      });

      if (dryRun) {
        return {
          success: true,
          scannedLogs: snapshot.size,
          updatedLogs: matchedTargets.length,
          matchedEntries: totalMatchedCount,
          totalQty: totalMatchedQty,
          dryRun: true
        };
      }

      if (matchedTargets.length === 0) {
        return {
          success: true,
          scannedLogs: snapshot.size,
          updatedLogs: 0,
          matchedEntries: 0,
          totalQty: 0,
          dryRun: false
        };
      }

      await updateDoc(productRef, {
        stock: increment(-totalMatchedQty),
        lastUpdated: serverTimestamp()
      });

      const batch = writeBatch(db);

      matchedTargets.forEach((target) => {
        batch.update(target.logRef, {
          items: target.items,
          unmatchedItems: target.unmatchedItems,
          needsReview: target.unmatchedItems.length > 0,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();

      return {
        success: true,
        scannedLogs: snapshot.size,
        updatedLogs: matchedTargets.length,
        matchedEntries: totalMatchedCount,
        totalQty: totalMatchedQty,
        dryRun: false
      };
    } catch (error) {
      console.error("SKU 일괄 매칭 실패:", error);
      return {
        success: false,
        scannedLogs: 0,
        updatedLogs: 0,
        matchedEntries: 0,
        totalQty: 0,
        dryRun: Boolean(params?.dryRun)
      };
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

      const primaryOrderData = primarySnap.exists() ? (primarySnap.data() as any) || {} : {};
      const primaryPhone =
        primaryOrderData.phone ||
        primaryOrderData.customerPhone ||
        primaryOrderData.buyerPhone ||
        primaryOrderData.receiverPhone ||
        primaryOrderData.tel ||
        primaryOrderData.mobile ||
        "";
      const primaryName =
        primaryOrderData.name ||
        primaryOrderData.customerName ||
        primaryOrderData.buyerName ||
        primaryOrderData.receiverName ||
        "";

      batch.set(primaryRef, {
        items: mergedItems,
        total_price: mergedTotalPrice,
        status: "READY",
        mergedOrderIds: orderIds,
        pickupCustomerKey: this.buildPickupCustomerKey(primaryName, primaryPhone),
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

      const restoredOrderSummaries: Record<
        string,
        {
          items: any[];
          total_price: number;
        }
      > = {};

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
          const restoredTotalPrice = orderItems.reduce(
            (sum, i) => sum + Number(i.subtotal || 0),
            0
          );

          const newShipmentRef = doc(
            collection(db, "orders", orderId, "shipments")
          );

          // Preserve original shipment metadata
          const restoredShipmentData = {
            ...shipmentData,
            items: orderItems,
            total_price: restoredTotalPrice,
            restoredAt: serverTimestamp()
          };

          batch.set(newShipmentRef, restoredShipmentData);

          if (!restoredOrderSummaries[orderId]) {
            restoredOrderSummaries[orderId] = {
              items: [],
              total_price: 0
            };
          }

          restoredOrderSummaries[orderId].items.push(...orderItems);
          restoredOrderSummaries[orderId].total_price += restoredTotalPrice;
        }

        // delete only if this shipment was originally merged into primary
        if (shipmentDoc.ref.parent.parent?.id === primaryOrderId) {
          batch.delete(shipmentDoc.ref);
        }
      }

      // 🔹 모든 주문 상태 / items / total_price 복구
      for (const orderId of mergedOrderIds) {
        const ref = doc(db, "orders", orderId);
        const restoredSummary = restoredOrderSummaries[orderId] || {
          items: [],
          total_price: 0
        };

        batch.set(
          ref,
          {
            status: "READY",
            mergedInto: null,
            items: restoredSummary.items,
            total_price: restoredSummary.total_price,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      // 🔹 primary 병합 정보 제거 + primary 주문 데이터도 자기 몫만 남기기
      const primarySummary = restoredOrderSummaries[primaryOrderId] || {
        items: [],
        total_price: 0
      };

      batch.set(
        primaryRef,
        {
          mergedOrderIds: [],
          items: primarySummary.items,
          total_price: primarySummary.total_price,
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
  // 🚚 배송 타입 수동 변경 (관리자 UI용)
  async updateDeliveryType(
    orderId: string,
    shipmentId: string | null,
    newType: "POST" | "VALEX" | "PICKUP"
  ) {
    try {
      const orderRef = doc(db, "orders", orderId);
      const batch = writeBatch(db);

      // 🔹 order 문서에 deliveryType 반영
      batch.set(
        orderRef,
        {
          deliveryType: newType,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      // 🔹 shipment가 존재하면 shipment에도 반영
      if (shipmentId) {
        const shipmentRef = doc(
          db,
          "orders",
          orderId,
          "shipments",
          shipmentId
        );

        batch.set(
          shipmentRef,
          {
            deliveryType: newType,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      await batch.commit();
      return true;
    } catch (error) {
      console.error("배송 타입 변경 실패:", error);
      return false;
    }
  }
}

export const inventoryService = new InventoryService();