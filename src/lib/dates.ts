import { DateTime } from 'luxon';
import type { Filters } from '../types';

export const cityZone = (city: string) =>
    ['London', 'Cambridge'].includes(city)
        ? 'Europe/London'
        : ['Bruxelles', 'Brussels', 'Brussel'].includes(city)
          ? 'Europe/Brussels'
          : 'Europe/Rome';
export const todayIn = (zone: string) =>
    DateTime.now().setZone(zone).toISODate()!;
export function dateBounds(
    filters: Filters,
    zone: string,
    now: DateTime = DateTime.now()
): [string | null, string | null] {
    if (filters.dateRange === 'anytime') return [null, null];
    const custom = filters.dateRange === 'custom';
    let start = DateTime.fromISO(
        custom ? filters.customStartDate : filters.currentDate,
        { zone }
    ).startOf('day');
    const endDate = custom ? filters.customEndDate : filters.currentDate;
    const end = DateTime.fromISO(endDate, { zone })
        .startOf('day')
        .plus({ days: filters.dateRange === 'thisWeek' ? 7 : 1 })
        .set({ hour: 4 });
    if (
        !start.isValid ||
        !end.isValid ||
        (custom && filters.customEndDate < filters.customStartDate)
    )
        throw new Error('Choose a valid start and end date.');
    // Today starts now; navigating to another day shows the entire selected day.
    if (!custom && start.hasSame(now.setZone(zone), 'day'))
        start = now.setZone(zone);
    return [start.toISO()!, end.toISO()!];
}
export const formatTime = (value: string, zone: string) =>
    DateTime.fromISO(value, { zone }).toFormat('HH:mm');
export const formatDate = (value: string, zone: string) =>
    DateTime.fromISO(value, { zone }).setLocale('en-GB').toFormat('ccc, d LLL');
export const dayKey = (value: string, zone: string) =>
    DateTime.fromISO(value, { zone }).toISODate()!;
export function rangeLabel(filters: Filters, zone: string) {
    const start = DateTime.fromISO(filters.currentDate, { zone }).setLocale(
        'en-GB'
    );
    return filters.dateRange === 'today'
        ? start.toFormat('cccc, d LLLL yyyy')
        : `${start.toFormat('d LLL yyyy')} – ${start.plus({ days: 6 }).toFormat('d LLL yyyy')}`;
}
