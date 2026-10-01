'use client';

/**
 * ไกด์ที่ผู้ใช้ปัจจุบันปักดาวไว้ — โหลดใหม่ทุกครั้งที่สลับ User (Header) · บันทึกทันทีที่ปัก/ถอดดาว
 * ปักดาวคนที่เคย "ตัดออก" ไว้ → นำออกจากชุดที่ตัดออกให้อัตโนมัติ (สองชุดนี้ห้ามซ้อนกัน)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import {
  GUIDE_PREFS_CHANGED_EVENT,
  notifyGuidePrefsChanged,
  readFavoriteGuideIds,
  writeFavoriteGuideIds,
} from '@/services/favoriteGuidesStore';
import { readExcludedGuideIds, writeExcludedGuideIds } from '@/services/excludedGuidesStore';
import { saveErrorMessage } from '@/services/browserStorage';

export function useFavoriteGuides(): {
  /** เซตรหัสไกด์ที่ผู้ใช้คนนี้ปักดาวไว้ — เช็คเร็วด้วย .has() */
  favorited: Set<string>;
  toggleFavorite: (id: string) => void;
} {
  const { currentUser, pushToast } = useDemo();

  // สลับ User (Header) แล้วต้องอ่านชุดของคนใหม่ทันที — รีเซ็ตค่าตอน render แทนการใช้ effect
  const [loadedFor, setLoadedFor] = useState(currentUser.id);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteGuideIds(currentUser.id));
  if (loadedFor !== currentUser.id) {
    setLoadedFor(currentUser.id);
    setFavoriteIds(readFavoriteGuideIds(currentUser.id));
  }

  // อีกจุดบนหน้าเดียวกันเปลี่ยนดาว/ตัดออก (เช่นกด "ตัดออก" แล้วถอดดาวให้) → อ่านชุดล่าสุดใหม่
  useEffect(() => {
    const reload = () => setFavoriteIds(readFavoriteGuideIds(currentUser.id));
    window.addEventListener(GUIDE_PREFS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(GUIDE_PREFS_CHANGED_EVENT, reload);
  }, [currentUser.id]);

  const toggleFavorite = useCallback(
    (id: string) => {
      const adding = !favoriteIds.includes(id);
      const next = adding ? [...favoriteIds, id] : favoriteIds.filter((x) => x !== id);
      setFavoriteIds(next);
      try {
        if (adding) {
          const excludedIds = readExcludedGuideIds(currentUser.id);
          if (excludedIds.includes(id)) writeExcludedGuideIds(currentUser.id, excludedIds.filter((x) => x !== id));
        }
        writeFavoriteGuideIds(currentUser.id, next);
      } catch (err) {
        pushToast('error', 'บันทึกดาวไม่สำเร็จ', saveErrorMessage(err));
      }
      notifyGuidePrefsChanged();
    },
    [favoriteIds, currentUser.id, pushToast],
  );

  const favorited = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  return { favorited, toggleFavorite };
}
