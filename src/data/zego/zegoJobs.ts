/**
 * แปลง ZegoPeriod (ข้อมูลจริงจากไฟล์ PDF) → TourJob เพื่อใช้ในหน้าจัดสเก็ต
 * แต่ละพีเรียด = หนึ่ง TourJob · จัดกลุ่มเป็นโปรแกรมด้วย programCode (มีอยู่แล้วใน TourJob)
 *
 * §7 ไม่มีเวลาเริ่ม/สิ้นสุดงานในไฟล์ → meetingDateTime ตั้งเป็น 00:00 (ระบบถือว่า "ยังไม่ระบุเวลา"
 *     และเตือนก่อนจัดหัวหน้าทัวร์) · flightNo = '—' (ไม่มีข้อมูลเที่ยวบินในไฟล์ ไม่คาดเดา)
 * §9 พีเรียดที่ไฟล์ระบุหัวหน้าทัวร์แล้ว: เก็บสถานะ/ประเภทไว้ใน periodRemark (ยังไม่ผูกกับรหัส
 *     หัวหน้าทัวร์ในระบบ เพื่อไม่กุชื่อ) → leaderId = null คงความสามารถเลือกได้ตามจริงของ Demo
 */

import type { TourJob } from '@/types';
import { zegoPeriods } from './zegoPeriods.seed';
import type { ZegoPeriod } from './types';

const LEADER_TYPE_LABEL: Record<string, string> = { ZEGO: 'หัวหน้าทัวร์ซีโก้', AGENCY: 'หัวหน้าทัวร์เอเจนซี่' };

function remarkOf(p: ZegoPeriod): string {
  const parts: string[] = [];
  if (p.assignmentStatus === 'ASSIGNED') parts.push(`แหล่งข้อมูลระบุ ${LEADER_TYPE_LABEL[p.assignedTourLeaderType ?? ''] ?? 'หัวหน้าทัวร์'}${p.assignedTourLeaderName ? ` (${p.assignedTourLeaderName})` : ' — โปรดตรวจสอบชื่อจากไฟล์ต้นฉบับ'}`);
  else if (p.assignmentStatus === 'EXTERNAL_ASSIGNED') parts.push('แหล่งข้อมูลระบุหัวหน้าทัวร์เอเจนซี่ (จัดภายนอก)');
  if (!p.hasExactWorkTime) parts.push('ยังไม่มีเวลาเริ่มและสิ้นสุดงาน กรุณาตรวจสอบก่อนจัดหัวหน้าทัวร์');
  if (p.ticketDeadlineText) parts.push(`เส้นตายออกตั๋ว: ${p.ticketDeadlineText}`);
  if (p.importWarnings.length) parts.push(...p.importWarnings);
  return parts.join(' · ');
}

function toJob(p: ZegoPeriod): TourJob {
  return {
    id: `JOB-${p.groupCode}`,
    title: p.rawProgramName || p.programCode,
    customer: 'Zego Travel (ข้อมูลตัวอย่างจากไฟล์)',
    country: p.country,
    cities: [],
    route: '',
    departDate: p.startDate,
    returnDate: p.endDate,
    meetingDateTime: `${p.startDate}T00:00`, // §7 ยังไม่มีเวลาเริ่มงานในไฟล์
    meetingPoint: '',
    outboundFlight: { flightNo: '—', route: '', departAt: `${p.startDate}T00:00`, arriveAt: `${p.startDate}T00:00` },
    inboundFlight: { flightNo: '—', route: '', departAt: `${p.endDate}T23:59`, arriveAt: `${p.endDate}T23:59` },
    paxCount: p.bookedSeats ?? 0,
    leaderId: null,
    assistantLeaderIds: [],
    coordinator: 'Zego (จำลอง)',
    leaderFee: 0,
    budget: 0,
    attachments: [],
    note: '',
    status: 'need_leader',
    history: [],
    // ระดับโปรแกรม/พีเรียด
    programCode: p.programCode,
    periodCode: p.groupCode,
    bus: p.bus ?? undefined,
    saleStatus: p.saleStatus,
    confirmStatus: p.confirmStatus,
    totalSeats: p.totalSeats ?? undefined,
    bookedSeats: p.bookedSeats ?? undefined,
    sellPrice: p.salePrice ?? undefined,
    promotionStatus: p.periodTags.length ? p.periodTags.join(' · ') : undefined,
    paymentInfo: p.paymentText ?? undefined,
    periodRemark: remarkOf(p) || undefined,
  };
}

/** 94 พีเรียดจริงจากไฟล์ Zego เป็น TourJob สำหรับหน้าจัดสเก็ต */
export const zegoPeriodJobs: TourJob[] = zegoPeriods.map(toJob);
