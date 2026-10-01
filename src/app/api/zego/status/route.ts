/**
 * GET /api/zego/status — ตรวจว่าเชื่อมต่อ Zego API ได้จริงหรือไม่
 *
 * ใช้กับปุ่ม "ทดสอบการเชื่อมต่อ" ในหน้าตั้งค่า — ยิง endpoint ที่เบาที่สุด (เวลาอัปเดตล่าสุด)
 * แล้วรายงานผลพร้อมบอกว่ากำลังใช้ Token จากที่ไหน
 */

import { readUpdatedAt } from '@/lib/logic/zegoApi';
import { resolveToken, zegoErrorResponse, zegoFetch, ZegoRequestError } from '../config';

export async function GET(request: Request) {
  const { token, source } = resolveToken(request);
  try {
    const raw = await zegoFetch('/programtours/updatelastesttime', token);
    return Response.json({ ok: true, tokenSource: source, updatedAt: readUpdatedAt(raw) });
  } catch (error) {
    /* ทดสอบไม่ผ่านไม่ใช่ความผิดพลาดของระบบ — ตอบ 200 พร้อมเหตุผล ให้หน้าจอแสดงได้ตรง ๆ */
    return error instanceof ZegoRequestError
      ? Response.json({ ok: false, tokenSource: source, error: error.message })
      : zegoErrorResponse(error);
  }
}
