/**
 * สรุปคะแนนและประวัติการเดินทางของหัวหน้าทัวร์ 1 คน — จากแถวคะแนนรายกรุ๊ป (buildGroupScoreRows)
 *
 * แบบสอบถามเก็บคะแนนเต็ม 10 (SCORE_SCALE) แต่หน้าหัวหน้าทัวร์แสดงเต็ม 5 ดาว → แปลงด้วย toFive
 * ใช้ร่วมกันระหว่าง Profile Header (คะแนนเฉลี่ย + จำนวนรีวิว) กับแท็บภาพรวม — ตัวเลขต้องตรงกันทั้งสองที่
 */

import { ISO_COUNTRY_SEED } from '@/data/isoCountries';
import { resolveDestination } from '@/lib/logic/destinations';
import type { TourGroupScoreRow } from '@/lib/logic/tourGroupScoreRows';

export interface ShareItem {
  key: string;
  label: string;
  count: number;
  /** % ของกรุ๊ปที่เดินทางแล้วทั้งหมด (0–100) */
  pct: number;
}

export interface LeaderScoreSummary {
  /** คะแนนเฉลี่ยเต็ม 5 — null = ยังไม่มีผลประเมิน */
  overall: number | null;
  /** จำนวนแบบสอบถามที่ตอบกลับ (รีวิว) */
  reviews: number;
  /** กรุ๊ปที่เดินทางแล้ว */
  groups: number;
  scoredGroups: number;
  /** การกระจายดาว 5 → 1 ของแบบสอบถามแต่ละฉบับ */
  stars: { star: number; count: number; pct: number }[];
  /** คะแนนเฉลี่ยรายเดือน 6 เดือนล่าสุด (เดือนออกเดินทาง) — null = เดือนนั้นไม่มีผลประเมิน */
  monthly: { month: string; avg: number | null }[];
  /** สัดส่วนกรุ๊ปที่เดินทางแล้ว ตามภูมิภาค / ประเทศ / เส้นทาง */
  share: { region: ShareItem[]; country: ShareItem[]; route: ShareItem[] };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** แบ่งสัดส่วน — เรียงมากไปน้อย เกิน limit รวมเป็น "อื่น ๆ" */
function shareOf(keys: { key: string; label: string }[], total: number, limit = 4): ShareItem[] {
  const m = new Map<string, ShareItem>();
  for (const k of keys) {
    const cur = m.get(k.key) ?? { key: k.key, label: k.label, count: 0, pct: 0 };
    cur.count += 1;
    m.set(k.key, cur);
  }
  const sorted = [...m.values()].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((n, x) => n + x.count, 0);
  if (rest > 0) head.push({ key: '__other', label: 'อื่น ๆ', count: rest, pct: 0 });
  return head.map((x) => ({ ...x, pct: total ? Math.round((x.count / total) * 100) : 0 }));
}

export function summarizeLeaderScores(rows: TourGroupScoreRow[], scaleMax: number, today: string): LeaderScoreSummary {
  const toFive = (v: number) => (v * 5) / scaleMax;
  const scored = rows.filter((r) => r.overall !== null);
  const overall = mean(scored.map((r) => toFive(r.overall!)));

  // ดาวของแต่ละฉบับ = ค่าเฉลี่ยทุกหมวดที่ตอบในฉบับนั้น (เต็ม 5) ปัดเป็นจำนวนเต็ม 1–5
  const responses = rows.flatMap((r) => r.responses);
  const perResponse = responses
    .map((x) => mean(x.answers.map((a) => a.score)))
    .filter((v): v is number => v !== null)
    .map((v) => Math.min(5, Math.max(1, Math.round(toFive(v)))));
  const stars = [5, 4, 3, 2, 1].map((star) => {
    const count = perResponse.filter((s) => s === star).length;
    return { star, count, pct: perResponse.length ? Math.round((count / perResponse.length) * 100) : 0 };
  });

  // 6 เดือนล่าสุด นับเดือนนี้ด้วย
  const [y, m] = today.split('-').map(Number);
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - (5 - i), 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { month, avg: mean(scored.filter((r) => r.departDate?.startsWith(month)).map((r) => toFive(r.overall!))) };
  });

  // สัดส่วนประสบการณ์ — นับทุกกรุ๊ปที่เดินทางแล้ว (ไม่เฉพาะที่มีคะแนน)
  const dest = rows.map((r) => {
    const d = resolveDestination(r.countryName, r.groupCode);
    const region = d.alpha2 ? ISO_COUNTRY_SEED.find((c) => c.alpha2.toLowerCase() === d.alpha2)?.region : undefined;
    return { row: r, country: { key: d.key, label: d.label }, region: { key: region ?? '—', label: region ?? 'ไม่ระบุ' } };
  });
  const share = {
    region: shareOf(dest.map((d) => d.region), rows.length),
    country: shareOf(dest.map((d) => d.country), rows.length),
    route: shareOf(rows.filter((r) => r.routeCode).map((r) => ({ key: r.routeCode!, label: r.routeCode! })), rows.length),
  };

  return {
    overall,
    reviews: responses.length,
    groups: rows.length,
    scoredGroups: scored.length,
    stars,
    monthly,
    share,
  };
}
