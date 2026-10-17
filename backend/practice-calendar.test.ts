import {test,expect} from '@jest/globals';
import {practiceCalendar} from './services/practiceCalendar.js';
test('calendar deduplicates completed days and handles UTC boundaries, gaps and future data',()=>{
 const result=practiceCalendar(['2026-10-13','2026-10-14','2026-10-14','2026-10-15','2026-10-19'],new Date('2026-10-16T00:01:00Z'));
 expect(result.currentStreak).toBe(3);expect(result.longestStreak).toBe(3);expect(result.days).toHaveLength(3);
 expect(practiceCalendar(result.days,new Date('2026-10-17T00:00:00Z')).currentStreak).toBe(0);
 expect(practiceCalendar([],new Date('2026-10-16')).longestStreak).toBe(0);
});
