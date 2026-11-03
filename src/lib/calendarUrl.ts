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
    const rawRange = params.get('dateRange');
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
            currentDate: params.get('date') ?? today,
            customStartDate: params.get('start') ?? today,
            customEndDate: params.get('end') ?? today,
        } satisfies Filters,
        city: params.get('city') ?? '',
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
    search: string,
    filters: Filters,
    city: string,
    groupBy: GroupBy,
    showMode: ShowMode,
    tableSort: TableSort | null
) {
    const params = new URLSearchParams(search);
    params.set('dateRange', filters.dateRange);
    params.set('date', filters.currentDate);
    if (city) params.set('city', city.toLowerCase());
    params.set('groupBy', groupBy);
    params.set('showMode', showMode);
    if (filters.dateRange === 'custom') {
        params.set('start', filters.customStartDate);
        params.set('end', filters.customEndDate);
    } else {
        params.delete('start');
        params.delete('end');
    }
    if (tableSort) params.set('tableSort', tableSort);
    else params.delete('tableSort');
    return params.toString();
}
