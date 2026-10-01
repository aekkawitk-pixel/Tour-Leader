/**
 * GET /api/zego/updated-at — เวลาที่ข้อมูลฝั่ง Zego ถูกแก้ไขล่าสุด
 *
 * ใช้ตอบคำถาม "ที่ดึงไว้ยังใหม่อยู่ไหม" โดยไม่ต้องดึงข้อมูลทั้งก้อนมาเทียบ
 */

import { readUpdatedAt } from '@/lib/logic/zegoApi';
import { resolveToken, zegoErrorResponse, zegoFetch } from '../config';

export async function GET(request: Request) {
  try {
    const raw = await zegoFetch('/programtours/updatelastesttime', resolveToken(request).token);
    return Response.json({ updatedAt: readUpdatedAt(raw) });
  } catch (error) {
    return zegoErrorResponse(error);
  }
}
