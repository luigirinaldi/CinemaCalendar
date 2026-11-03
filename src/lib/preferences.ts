import { readCalendarUrl } from './calendarUrl';
import { searchArea } from './location';

export const PREFERENCES_KEY = 'cineview.preferences.v1';
type StorageReader = Pick<Storage, 'getItem'>;

export function initialCalendarState(
    search: string,
    today: string,
    storage: StorageReader | null
) {
    const url = readCalendarUrl(search, today);
    try {
        const saved = JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? '{}');
        if (!saved || typeof saved !== 'object') return url;
        const params = new URLSearchParams(search);
        const view = readCalendarUrl(
            new URLSearchParams({
                groupBy: String(saved.groupBy ?? ''),
                showMode: String(saved.showMode ?? ''),
                tableSort: String(saved.tableSort ?? ''),
            }).toString(),
            today
        );
        const hasLocation = params.has('city') || params.has('near');
        const area = saved.area;
        return {
            ...url,
            city: hasLocation
                ? url.city
                : typeof saved.city === 'string'
                  ? saved.city
                  : '',
            area: hasLocation
                ? url.area
                : area &&
                    typeof area.lat === 'number' &&
                    typeof area.lng === 'number' &&
                    typeof area.km === 'number'
                  ? searchArea(area.lat, area.lng, area.km)
                  : null,
            groupBy: params.has('groupBy') ? url.groupBy : view.groupBy,
            showMode: params.has('showMode') ? url.showMode : view.showMode,
            tableSort: params.has('tableSort') ? url.tableSort : view.tableSort,
        };
    } catch {
        return url;
    }
}
