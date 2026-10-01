/**
 * จุดสลับ data source ของทั้งระบบ
 *
 * ตอนนี้: mockService (ข้อมูลจำลองใน memory)
 * อนาคต: สร้าง apiService ที่ implement `TourLeaderService` แล้วเปลี่ยนบรรทัดล่างเป็น
 *        export const service: TourLeaderService = apiService;
 */

import { mockService } from './mockService';
import type { TourLeaderService } from './types';

export const service: TourLeaderService = mockService;
export type { DataSnapshot, TourLeaderService } from './types';
