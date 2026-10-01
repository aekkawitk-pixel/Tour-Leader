/** โครงสร้างข้อมูล Program/Period ตามรายงานโปรแกรมทัวร์ Zego (ไม่มีข้อมูล Ticket Stock/PNR) */

export type ZegoSaleStatus = 'SELL' | 'CLOSE' | string;
export type ZegoConfirmStatus = 'CONFIRMED' | 'NOT_SPECIFIED' | string;
export type ZegoAssignmentStatus = 'UNASSIGNED' | 'ASSIGNED' | 'EXTERNAL_ASSIGNED';
export type ZegoLeaderType = 'ZEGO' | 'AGENCY' | null;

/**
 * เที่ยวบินของโปรแกรม (Zego API ส่งมาระดับโปรแกรม ไม่ใช่ระดับพีเรียด)
 * เวลาเป็นข้อความตามที่ API ส่งมา ไม่แปลงเป็นวันที่ เพราะเป็นเวลาประจำเที่ยวบิน ไม่ผูกกับวันเดินทางใด
 */
export interface ZegoFlight {
  airlineCode: string;
  airlineName: string;
  flightNo: string;
  /** เส้นทางบิน เช่น BKK-CAN */
  route: string;
  departureTime: string;
  arrivalTime: string;
}

export interface ZegoProgram {
  id: string;
  programCode: string;
  programName: string | null;
  rawProgramName: string;
  country: string;
  countryCode: string;
  durationDays: number | null;
  durationNights: number | null;
  periodCount: number;
  createdFromSampleFile: boolean;
  /** เที่ยวบินของโปรแกรม — ไม่มีในข้อมูลตัวอย่างจากไฟล์ PDF จึงเป็น optional */
  flights?: ZegoFlight[];
}

export interface ZegoPeriod {
  id: string;
  seq: number;
  programId: string;
  programCode: string;
  groupCode: string;
  bus: string | null;
  country: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  startDateTime: string | null;
  endDateTime: string | null;
  hasExactWorkTime: boolean;
  saleStatus: ZegoSaleStatus;
  confirmStatus: ZegoConfirmStatus;
  periodTags: string[];
  ticketDeadline: string | null;
  ticketDeadlineText: string | null;
  paymentText: string | null;
  originalPrice: number | null;
  salePrice: number | null;
  totalSeats: number | null;
  bookedSeats: number | null;
  remainingSeats: number | null;
  rawRemainingValue: string;
  isOverbooked: boolean;
  overbookedSeats: number;
  assignedTourLeaderName: string | null;
  assignedTourLeaderType: ZegoLeaderType;
  assignmentStatus: ZegoAssignmentStatus;
  remark: string | null;
  rawProgramName: string;
  /** สายการบิน/สนามบินของพีเรียดนั้น — API ส่งมาระดับพีเรียด ต่างจาก Flights ที่เป็นระดับโปรแกรม */
  airlineCode?: string;
  airlineName?: string;
  airport?: string;
  rawText: string;
  sourcePage: number;
  importWarnings: string[];
}
