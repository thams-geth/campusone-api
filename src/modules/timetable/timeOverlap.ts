// "HH:mm" strings sort lexicographically the same as chronologically, so
// plain string comparison is enough to detect overlap — no need to parse
// into minutes. Shared by timetable.service.ts's faculty/room/section
// conflict detection and periodSlot.service.ts's period-overlap validation.
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}
