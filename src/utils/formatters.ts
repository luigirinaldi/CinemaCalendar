export const formatTime = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleTimeString('en-UK', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const formatDate = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-UK', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
};

export const formatDateRange = (start: Date, end: Date) => {
    const startStr = start.toLocaleDateString('en-UK', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
    const endStr = end.toLocaleDateString('en-UK', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
    return `${startStr} - ${endStr}`;
};
