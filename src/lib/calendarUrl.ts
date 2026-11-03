import { searchArea, type SearchArea } from './location';
import {
    GROUP_BY_VALUES,
    SHOW_MODE_VALUES,
    TABLE_SORT_VALUES,
    type DateRange,
    type Filters,
    type GroupBy,
    type ShowMode,
    type TableSort,
} from '../types';

export function readCalendarUrl(search: string, today: string) {
    const params = new URLSearchParams(search);
    const parts = params.get('near')?.split(',');
    const near = parts?.every((value) => value.trim() !== '')
        ? parts.map(Number)
        : null;
    const area =
        near?.length === 3 && near.every(Number.isFinite)
            ? searchArea(near[0], near[1], near[2])
            : null;
    const rawRange =
        params.has('from') || params.has('to')
            ? 'custom'
            : params.has('on')
              ? 'today'
              : params.has('week')
                ? 'thisWeek'
                : (params.get('when') ?? params.get('dateRange'));
    const dateRange: DateRange =
        rawRange === 'range'
            ? 'custom'
            : rawRange === 'today' ||
                rawRange === 'anytime' ||
                rawRange === 'custom' ||
                rawRange === 'thisWeek'
              ? rawRange
              : 'thisWeek';
    const groupBy = params.get('groupBy') as GroupBy;
    const showMode = params.get('showMode') as ShowMode;
    const tableSort = params.get('tableSort') as TableSort;
    return {
        filters: {
            dateRange,
            currentDate:
                params.get('on') ??
                params.get('week') ??
                params.get('date') ??
                today,
            customStartDate: params.get('from') ?? params.get('start') ?? today,
            customEndDate: params.get('to') ?? params.get('end') ?? today,
        } satisfies Filters,
        city: area ? '' : (params.get('city') ?? ''),
        area,
        groupBy: GROUP_BY_VALUES.includes(groupBy)
            ? groupBy
            : ('movie' as GroupBy),
        showMode: SHOW_MODE_VALUES.includes(showMode)
            ? showMode
            : ('compact' as ShowMode),
        tableSort: TABLE_SORT_VALUES.includes(tableSort) ? tableSort : null,
    };
}

export function calendarSearch(
    filters: Filters,
    city: string,
    area: SearchArea | null,
    today: string
) {
    const params = new URLSearchParams();
    if (area) params.set('near', `${area.lat},${area.lng},${area.km}`);
    else if (city) params.set('city', city.toLowerCase());
    if (filters.dateRange === 'custom') {
        params.set('from', filters.customStartDate);
        params.set('to', filters.customEndDate);
    } else if (filters.dateRange === 'anytime') {
        params.set('when', 'anytime');
    } else if (filters.currentDate !== today) {
        params.set(
            filters.dateRange === 'today' ? 'on' : 'week',
            filters.currentDate
        );
    } else if (filters.dateRange === 'today') {
        params.set('when', 'today');
    }
    return params.toString().replaceAll('%2C', ',');
}
