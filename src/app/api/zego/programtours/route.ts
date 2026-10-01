/**
 * GET /api/zego/programtours — ดึงโปรแกรมทัวร์จาก Zego API แล้วแปลงเป็นโครงสร้างภายใน
 *
 * ทำงานฝั่งเซิร์ฟเวอร์เพื่อไม่ให้ Token หลุดไปเบราว์เซอร์ (ดู config.ts)
 * Query ที่รองรับ — เลือกได้อย่างใดอย่างหนึ่ง ไม่ใส่ = ดึงทั้งหมด
 *   ?country=<CountryCode>   → /programtours/country/{CountryCode}
 *   ?iso=<ISO2/ISO3>         → /programtours/country-iso/{ISOCode}
 *   ?product=<ProductCode>   → /programtours/{ProductCode}
 */

import { normalizeZegoPrograms } from '@/lib/logic/zegoApi';
import { resolveToken, zegoErrorResponse, zegoFetch } from '../config';

/** ค่าที่ผู้ใช้ส่งมาไปต่อท้าย URL — กันอักขระที่ทำให้หลุดออกนอก path ที่ตั้งใจ */
function safeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const country = params.get('country')?.trim();
  const iso = params.get('iso')?.trim();
  const product = params.get('product')?.trim();

  let path = '/programtours';
  if (product) path = `/programtours/${safeSegment(product)}`;
  else if (country) path = `/programtours/country/${safeSegment(country)}`;
  else if (iso) path = `/programtours/country-iso/${safeSegment(iso)}`;

  try {
    const raw = await zegoFetch(path, resolveToken(request).token);
    /* ขอทีละโปรแกรม API อาจคืน Object เดี่ยว — ห่อเป็น Array ให้ตัวแปลงทำงานทางเดียวเสมอ */
    const list = Array.isArray(raw) ? raw : [raw];
    const { programs, periods, skipped } = normalizeZegoPrograms(list);
    return Response.json({
      programs,
      periods,
      skipped,
      fetchedPath: path,
    });
  } catch (error) {
    return zegoErrorResponse(error);
  }
}
