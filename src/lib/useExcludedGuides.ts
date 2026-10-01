'use client';

/**
 * ไกด์ที่ผู้ใช้ปัจจุบันตัดออกจากรายการที่จะแนะนำ/เลือกได้ — โหลดใหม่ทุกครั้งที่สลับ User (Header)
 * บันทึกทันทีที่ตัดออก/นำกลับเข้ามา
 * ตัดออกคนที่ปักดาวไว้ → ถอดดาวให้อัตโนมัติ (สองชุดนี้ห้ามซ้อนกัน)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { readExcludedGuideIds, writeExcludedGuideIds } from '@/services/excludedGuidesStore';
import {
  GUIDE_PREFS_CHANGED_EVENT,
  notifyGuidePrefsChanged,
  readFavoriteGuideIds,
  writeFavoriteGuideIds,
} from '@/services/favoriteGuidesStore';
import { saveErrorMessage } from '@/services/browserStorage';

/**
 * ชุดที่ตัดออก "ที่มีผลจริง" — ข้อมูลเก่าที่บันทึกไว้ก่อนมีกติกาห้ามซ้อนอาจมีคนที่ทั้งปักดาวและตัดออก
 * ถือว่าดาวชนะ (ไม่ซ่อนคนที่ผู้ใช้ปักดาวไว้เอง)
 */
function readEffectiveExcluded(userId: string): string[] {
  const fav = new Set(readFavoriteGuideIds(userId));
  return readExcludedGuideIds(userId).filter((id) => !fav.has(id));
}

export function useExcludedGuides(): {
  /** เซตรหัสไกด์ที่ผู้ใช้คนนี้ตัดออกไว้ — เช็คเร็วด้วย .has() */
  excluded: Set<string>;
  excludedIds: string[];
  exclude: (id: string) => void;
  include: (id: string) => void;
} {
  const { currentUser, pushToast } = useDemo();

  // สลับ User (Header) แล้วต้องอ่านชุดของคนใหม่ทันที — รีเซ็ตค่าตอน render แทนการใช้ effect
  const [loadedFor, setLoadedFor] = useState(currentUser.id);
  const [excludedIds, setExcludedIds] = useState<string[]>(() => readEffectiveExcluded(currentUser.id));
  if (loadedFor !== currentUser.id) {
    setLoadedFor(currentUser.id);
    setExcludedIds(readEffectiveExcluded(currentUser.id));
  }

  // อีกจุดบนหน้าเดียวกันเปลี่ยนดาว/ตัดออก (เช่นปักดาวแล้วนำออกจากชุดนี้ให้) → อ่านชุดล่าสุดใหม่
  useEffect(() => {
    const reload = () => setExcludedIds(readEffectiveExcluded(currentUser.id));
    window.addEventListener(GUIDE_PREFS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(GUIDE_PREFS_CHANGED_EVENT, reload);
  }, [currentUser.id]);

  const persist = useCallback(
    (next: string[], unfavoriteId?: string) => {
      setExcludedIds(next);
      try {
        if (unfavoriteId) {
          const fav = readFavoriteGuideIds(currentUser.id);
          if (fav.includes(unfavoriteId)) writeFavoriteGuideIds(currentUser.id, fav.filter((x) => x !== unfavoriteId));
        }
        writeExcludedGuideIds(currentUser.id, next);
      } catch (err) {
        pushToast('error', 'บันทึกรายชื่อที่ไม่ต้องการไม่สำเร็จ', saveErrorMessage(err));
      }
      notifyGuidePrefsChanged();
    },
    [currentUser.id, pushToast],
  );

  const exclude = useCallback(
    (id: string) => persist(excludedIds.includes(id) ? excludedIds : [...excludedIds, id], id),
    [excludedIds, persist],
  );
  const include = useCallback(
    (id: string) => persist(excludedIds.filter((x) => x !== id)),
    [excludedIds, persist],
  );

  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);

  return { excluded, excludedIds, exclude, include };
}
