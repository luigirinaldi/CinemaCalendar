export type DateRange = 'today' | 'thisWeek' | 'anytime' | 'custom';
export type GroupBy = 'movie' | 'cinema';
export interface Filters {
    dateRange: DateRange;
    currentDate: string;
    customStartDate: string;
    customEndDate: string;
}
