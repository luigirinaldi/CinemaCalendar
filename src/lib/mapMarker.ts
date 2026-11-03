/** Build a marker that remains visible while a favicon is loading or fails. */
export function cinemaMarkerElement(
    document: Document,
    name: string,
    website: string | null | undefined,
    available: boolean,
    count: number
): HTMLElement {
    const element = document.createElement('div');
    element.style.cssText = `position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:${available ? '#ef4444' : '#525252'};color:#fff;border-radius:4px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.5)`;
    element.textContent =
        name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => Array.from(word)[0].toUpperCase())
            .join('') || '?';
    let host = '';
    try {
        host = website ? new URL(website).hostname : '';
    } catch {
        /* Use initials for invalid websites. */
    }
    if (host) {
        const image = document.createElement('img');
        image.alt = '';
        image.width = image.height = 32;
        image.style.cssText = `display:none;position:absolute;inset:0;border-radius:4px;background:#525252;object-fit:contain;filter:${available ? 'none' : 'grayscale(100%)'}`;
        image.onload = () => {
            image.style.display = 'block';
        };
        image.onerror = () => image.remove();
        image.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
        element.append(image);
    }
    if (available && count > 0) {
        const badge = document.createElement('span');
        badge.style.cssText =
            'position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border-radius:999px;font-size:10px;font-weight:700;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 3px;box-shadow:0 1px 2px rgba(0,0,0,0.5)';
        badge.textContent = String(count);
        element.append(badge);
    }
    return element;
}
