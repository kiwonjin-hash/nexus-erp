// Vercel Edge Middleware — IP 화이트리스트
// IP 변경 시 ALLOWED_IPS 수정 후 재배포

export const config = {
  matcher: "/(.*)",
};

const ALLOWED_IPS = [
  "221.142.57.114", // 여의도 금거래소 사무실 (SK Broadband) — 유동IP 변경 시 수정
];

export default function middleware(request: Request): Response | undefined {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "";

  if (!ALLOWED_IPS.includes(ip)) {
    return new Response("접근 권한이 없습니다.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 허용 IP — 통과
  return undefined;
}
