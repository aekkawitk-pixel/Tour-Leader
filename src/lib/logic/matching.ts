/**
 * สูตรคำนวณคะแนนความเหมาะสมของหัวหน้าทัวร์กับงาน — แยกจาก UI ทั้งหมด
 * เปลี่ยนน้ำหนักคะแนนได้ที่ WEIGHTS โดยไม่ต้องแตะ Component
 *
 * เกณฑ์ (รวม 100 คะแนน)
 *   เส้นทาง/ประเทศ  35   ภาษา 25   ความถนัดกรุ๊ป 15
 *   คะแนนประเมิน    10   สถานะพร้อมรับงาน 5   ไม่มีงานซ้อน 10
 * หักคะแนน: เอกสารเดินทางใกล้หมดอายุ / หมดอายุ, ถูกระงับใช้งาน
 */

import type {
  Country,
  LeaderMatch,
  MatchFactor,
  TourJob,
  TourLeader,
  TourRoute,
} from '@/types';
import { ROUTE_SKILL_LEVEL, TOUR_SKILL_LEVEL } from '@/lib/labels';
import { maxRankOf } from '@/data/leaders/languageStandards';
import { diffDays } from '@/lib/format';
import { findConflictsForLeader } from './conflicts';
import {
  bestLanguageAmong,
  countryByName,
  coversAirport,
  jobAirportCodes,
  passportExpiryOf,
  skillForCountry,
} from './leaderProfile';

export const WEIGHTS = {
  route: 35,
  language: 25,
  tourSkill: 15,
  rating: 10,
  availability: 5,
  noConflict: 10,
} as const;

/** ภาษาหลักที่ควรใช้ในแต่ละประเทศ (ข้อมูลจำลองสำหรับ Demo) */
const COUNTRY_LANGUAGE: Record<string, string[]> = {
  ญี่ปุ่น: ['ญี่ปุ่น', 'อังกฤษ'],
  เกาหลีใต้: ['เกาหลี', 'อังกฤษ'],
  จีน: ['จีนกลาง', 'อังกฤษ'],
  ไต้หวัน: ['จีนกลาง', 'อังกฤษ'],
  เวียดนาม: ['เวียดนาม', 'อังกฤษ'],
  ฝรั่งเศส: ['ฝรั่งเศส', 'อังกฤษ'],
  อิตาลี: ['อิตาลี', 'อังกฤษ'],
  สวิตเซอร์แลนด์: ['เยอรมัน', 'ฝรั่งเศส', 'อังกฤษ'],
  ตุรกี: ['อังกฤษ'],
  จอร์เจีย: ['อังกฤษ', 'รัสเซีย'],
  นิวซีแลนด์: ['อังกฤษ'],
  ออสเตรเลีย: ['อังกฤษ'],
};

/** ภาษาที่ควรใช้กับงานของประเทศนี้ (ใช้เลือกภาษาที่ "เกี่ยวข้อง" มาแสดง) */
export function preferredLanguagesForCountry(country: string): string[] {
  return COUNTRY_LANGUAGE[country] ?? ['อังกฤษ'];
}

/** สัดส่วนคะแนนตามระดับความเชี่ยวชาญเส้นทาง */
const ROUTE_LEVEL_WEIGHT: Record<string, number> = {
  traveled: 0.4,
  assisted: 0.6,
  can_lead: 0.8,
  expert: 0.95,
  principal: 1,
};

const TOUR_SKILL_WEIGHT: Record<string, number> = {
  able: 0.5,
  good: 0.7,
  strong: 0.9,
  expert: 1,
};

export interface MatchContext {
  countries: Country[];
  routes: TourRoute[];
  allJobs: TourJob[];
  today: string;
}

export function scoreLeaderForJob(
  leader: TourLeader,
  job: Pick<
    TourJob,
    | 'id'
    | 'country'
    | 'departDate'
    | 'returnDate'
    | 'customerGroup'
    | 'outboundFlight'
    | 'inboundFlight'
  >,
  ctx: MatchContext,
): LeaderMatch {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const factors: MatchFactor[] = [];

  const country = countryByName(ctx.countries, job.country);
  const airports = jobAirportCodes(job as TourJob);

  /* ------------------------- 1) เส้นทาง / ประเทศ ------------------------- */
  let routeEarned = 0;
  let routeDetail = `ไม่มีประสบการณ์ ${job.country} ในระบบ`;

  const skill = country ? skillForCountry(leader, country.id) : undefined;
  if (skill && country) {
    const levelWeight = ROUTE_LEVEL_WEIGHT[skill.skillLevel] ?? 0.5;
    const levelLabel = ROUTE_SKILL_LEVEL[skill.skillLevel].label;

    if (skill.coverage === 'all_routes') {
      routeEarned = WEIGHTS.route * levelWeight;
      routeDetail = `${levelLabel} ${country.nameEn} ทุกเส้นทาง`;
      reasons.push(`${levelLabel} ${country.nameEn} ทุกเส้นทาง`);
    } else {
      // เลือกเฉพาะเส้นทาง → ต้องดูว่าครอบคลุมสนามบินของงานนี้ไหม
      const covered = airports.filter((code) => coversAirport(leader, ctx.routes, code));
      const missing = airports.filter((code) => !coversAirport(leader, ctx.routes, code));

      if (airports.length === 0) {
        routeEarned = WEIGHTS.route * levelWeight * 0.8;
        routeDetail = `${levelLabel} ${country.nameEn} (เฉพาะบางเส้นทาง)`;
        reasons.push(`${levelLabel} ${country.nameEn} เฉพาะบางเส้นทาง`);
      } else if (missing.length === 0) {
        routeEarned = WEIGHTS.route * levelWeight;
        routeDetail = `${levelLabel} ${country.nameEn} — ครอบคลุมเส้นทาง ${covered.join(', ')}`;
        reasons.push(`เคยทำเส้นทาง ${covered.join(', ')}`);
      } else {
        // มีประสบการณ์ในประเทศ แต่ไม่ครอบคลุมสนามบินของงานนี้ (เช่น มีแค่ NRT แต่งานบินเข้า KIX)
        routeEarned = WEIGHTS.route * levelWeight * 0.45;
        routeDetail = `${levelLabel} ${country.nameEn} แต่ยังไม่เคยทำเส้นทาง ${missing.join(', ')}`;
        warnings.push(
          `มีประสบการณ์ ${country.nameEn} แต่ยังไม่เคยทำเส้นทาง ${missing.join(', ')}`,
        );
        if (covered.length > 0) reasons.push(`เคยทำเส้นทาง ${covered.join(', ')}`);
      }
    }

    if (skill.tripCount && skill.tripCount > 0) {
      const label = airports[0] ?? country.nameEn;
      reasons.push(`เคยทำเส้นทาง ${label} ${skill.tripCount} ครั้ง`);
      // โบนัสประสบการณ์ (ไม่เกิน 15% ของคะแนนเส้นทาง)
      routeEarned += Math.min(WEIGHTS.route * 0.15, skill.tripCount * 0.4);
    }
  } else {
    warnings.push(`ไม่มีประสบการณ์เส้นทาง ${job.country} ในระบบ`);
  }

  routeEarned = Math.min(WEIGHTS.route, Math.round(routeEarned));
  factors.push({ key: 'เส้นทาง', earned: routeEarned, max: WEIGHTS.route, detail: routeDetail });

  /* ------------------------------- 2) ภาษา ------------------------------- */
  const wanted = COUNTRY_LANGUAGE[job.country] ?? ['อังกฤษ'];
  const best = bestLanguageAmong(leader, wanted);
  let languageEarned = 0;
  let languageDetail = `ไม่มีภาษาที่ตรงกับเส้นทาง (${wanted.join(' / ')})`;

  if (best) {
    // เทียบเป็นสัดส่วนอันดับภายในมาตรฐานของภาษานั้นเอง (ห้ามเทียบ rank ข้ามมาตรฐานตรง ๆ)
    const fraction = best.isNativeLanguage ? 1 : (best.levelRank ?? 0) / maxRankOf(best.standard);
    const levelText = best.isNativeLanguage ? 'ภาษาแม่' : (best.levelName ?? '');
    languageEarned = Math.round(WEIGHTS.language * fraction);
    languageDetail = `ภาษา${best.languageName}ระดับ${levelText}`;
    reasons.push(languageDetail);
    // เตือนเมื่อยังอยู่ครึ่งล่างของมาตรฐาน
    if (!best.isNativeLanguage && fraction <= 0.5) {
      warnings.push(`ภาษา${best.languageName}ยังอยู่ระดับ${levelText}`);
    }
  } else {
    warnings.push(languageDetail);
  }
  factors.push({
    key: 'ภาษา',
    earned: languageEarned,
    max: WEIGHTS.language,
    detail: languageDetail,
  });

  /* --------------------------- 3) ความถนัดกรุ๊ป --------------------------- */
  let skillEarned = 0;
  let skillDetail = 'งานนี้ไม่ได้ระบุประเภทกรุ๊ป';

  if (job.customerGroup) {
    const groupSkill = leader.tourSkills
      .filter((s) => s.category === 'customer_group')
      .find((s) => s.name === job.customerGroup || s.code === 'GROUP_ALL');

    if (groupSkill) {
      skillEarned = Math.round(WEIGHTS.tourSkill * (TOUR_SKILL_WEIGHT[groupSkill.level] ?? 0.5));
      const levelLabel = TOUR_SKILL_LEVEL[groupSkill.level].label;
      skillDetail =
        groupSkill.code === 'GROUP_ALL'
          ? `รับได้ทุกประเภทกรุ๊ป (${levelLabel})`
          : `${levelLabel}${job.customerGroup}`;
      reasons.push(skillDetail);
    } else {
      skillDetail = `ไม่เคยระบุความถนัด${job.customerGroup}`;
      warnings.push(skillDetail);
    }
  } else {
    // ไม่ระบุประเภทกรุ๊ป → ให้คะแนนกลาง ๆ ไม่ลงโทษ
    skillEarned = Math.round(WEIGHTS.tourSkill * 0.6);
  }
  factors.push({
    key: 'ความถนัดกรุ๊ป',
    earned: skillEarned,
    max: WEIGHTS.tourSkill,
    detail: skillDetail,
  });

  /* ---------------------------- 4) คะแนนประเมิน --------------------------- */
  const ratingEarned = Math.round((leader.rating / 5) * WEIGHTS.rating);
  factors.push({
    key: 'คะแนนประเมิน',
    earned: ratingEarned,
    max: WEIGHTS.rating,
    detail: `คะแนนประเมินเฉลี่ย ${leader.rating.toFixed(1)}`,
  });
  if (leader.rating >= 4.5) reasons.push(`คะแนนประเมินเฉลี่ย ${leader.rating.toFixed(1)}`);

  /* ------------------------------ 5) สถานะ ------------------------------- */
  let availabilityEarned = 0;
  let availabilityDetail = '';
  if (leader.status === 'available') {
    availabilityEarned = WEIGHTS.availability;
    availabilityDetail = 'สถานะพร้อมรับงาน';
    reasons.push('สถานะพร้อมรับงาน');
  } else if (leader.status === 'unavailable') {
    availabilityDetail = 'สถานะไม่พร้อมรับงาน';
    warnings.push('สถานะไม่พร้อมรับงาน');
  } else {
    availabilityDetail = 'ถูกระงับใช้งาน';
    warnings.push('ถูกระงับใช้งาน');
  }
  factors.push({
    key: 'สถานะ',
    earned: availabilityEarned,
    max: WEIGHTS.availability,
    detail: availabilityDetail,
  });

  /* ----------------------------- 6) งานซ้อน ------------------------------ */
  const conflicts = findConflictsForLeader(leader.id, job as TourJob, ctx.allJobs);
  const conflictEarned = conflicts.length === 0 ? WEIGHTS.noConflict : 0;
  if (conflicts.length === 0) {
    reasons.push('ไม่มีตารางงานซ้อน');
  } else {
    warnings.push(`มีงานอื่นในช่วงเวลาเดียวกัน (${conflicts.map((c) => c.id).join(', ')})`);
  }
  factors.push({
    key: 'ตารางงาน',
    earned: conflictEarned,
    max: WEIGHTS.noConflict,
    detail:
      conflicts.length === 0
        ? 'ไม่มีตารางงานซ้อน'
        : `ซ้อนกับ ${conflicts.map((c) => c.id).join(', ')}`,
  });

  /* ---------------------------- หักคะแนนพิเศษ ---------------------------- */
  let penalty = 0;
  const passportExpiry = passportExpiryOf(leader);
  const daysToExpiry = passportExpiry ? diffDays(job.departDate, passportExpiry) : -1;
  const documentsValid = daysToExpiry >= 183;

  if (!passportExpiry) {
    warnings.push('ยังไม่มีหนังสือเดินทางในระบบ');
    penalty += 25;
  } else if (daysToExpiry < 0) {
    warnings.push('หนังสือเดินทางหมดอายุแล้ว');
    penalty += 25;
  } else if (!documentsValid) {
    warnings.push('หนังสือเดินทางเหลืออายุน้อยกว่า 6 เดือน ณ วันเดินทาง');
    penalty += 10;
  }
  if (leader.usageStatus !== 'active') penalty += 25;

  const raw =
    routeEarned + languageEarned + skillEarned + ratingEarned + availabilityEarned + conflictEarned;
  const score = Math.max(0, Math.min(100, raw - penalty));

  return {
    leaderId: leader.id,
    score,
    factors,
    reasons,
    warnings,
    hasConflict: conflicts.length > 0,
    documentsValid,
  };
}

/** เรียงหัวหน้าทัวร์ตามความเหมาะสม (มากไปน้อย) */
export function rankLeaders(
  leaders: TourLeader[],
  job: Parameters<typeof scoreLeaderForJob>[1],
  ctx: MatchContext,
): LeaderMatch[] {
  return leaders
    .filter((l) => l.active)
    .map((l) => scoreLeaderForJob(l, job, ctx))
    .sort((a, b) => b.score - a.score);
}

export function matchLabel(score: number): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (score >= 75) return { label: 'เหมาะสมมาก', tone: 'green' };
  if (score >= 50) return { label: 'พอเหมาะ', tone: 'amber' };
  return { label: 'ไม่ค่อยเหมาะ', tone: 'red' };
}

/** ใช้ต่อในหน้ารายการหัวหน้าทัวร์และ Dashboard */
export function isPassportExpiringSoon(leader: TourLeader, referenceDate: string): boolean {
  const expiry = passportExpiryOf(leader);
  if (!expiry) return true;
  return diffDays(referenceDate, expiry) < 183;
}
