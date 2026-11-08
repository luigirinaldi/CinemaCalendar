import { DateTime } from 'luxon';
import type { FieldMapping, ScraperConfig } from './scraperConfig';

/** Literal operations: no scripts or expressions from the page are executed. */
export function cleanField(value: string, field: FieldMapping): string {
    let result = value.replace(/\s+/gu, ' ').trim();
    if (field.after) {
        const index = result.indexOf(field.after);
        if (index < 0)
            throw new Error(`Text does not contain “${field.after}”`);
        result = result.slice(index + field.after.length);
    }
    if (field.before) {
        const index = result.indexOf(field.before);
        if (index < 0)
            throw new Error(`Text does not contain “${field.before}”`);
        result = result.slice(0, index);
    }
    for (const replacement of field.replacements ?? [])
        result = result.split(replacement.find).join(replacement.replace);
    return result.replace(/\s+/gu, ' ').trim();
}

export function parseScreeningTime(
    value: string,
    day: string,
    config: Pick<
        ScraperConfig,
        'dateFormat' | 'dateLocale' | 'timezone' | 'cinema'
    >
): string {
    const input = (day ? `${day} ${value}` : value)
        .replace(/\s+/gu, ' ')
        .trim();
    const options = {
        zone: config.timezone,
        locale: config.dateLocale || config.cinema.defaultLanguage,
    };
    const epoch = ['unix-ms', 'unix-seconds'].includes(config.dateFormat);
    if (epoch && !/^\d{10,13}(?:\.\d+)?$/.test(value))
        throw new Error(`Invalid Unix timestamp: ${value}`);
    const parsed =
        config.dateFormat === 'unix-ms'
            ? DateTime.fromMillis(Number(value), options)
            : config.dateFormat === 'unix-seconds'
              ? DateTime.fromSeconds(Number(value), options)
              : config.dateFormat
                ? DateTime.fromFormat(input, config.dateFormat, options)
                : DateTime.fromISO(input.replace(' ', 'T'), options);
    const explained =
        !epoch && config.dateFormat
            ? DateTime.fromFormatExplain(input, config.dateFormat, options)
            : null;
    const hasDateAndTime =
        epoch ||
        (explained
            ? explained.result?.year != null &&
              explained.result?.month != null &&
              explained.result?.day != null &&
              explained.result?.hour != null
            : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.replace(' ', 'T')));
    if (!parsed.isValid || !hasDateAndTime)
        throw new Error(
            `Cannot parse a full screening date and time: “${input}”. Check the format, date language and timezone; include an explicit year and time.`
        );
    return parsed.toUTC().toISO()!;
}
