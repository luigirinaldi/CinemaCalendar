import type { ScraperConfig } from '../../shared/scraperConfig';

export function scraperFilename(name: string) {
    const words = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .match(/[a-zA-Z0-9]+/g) ?? ['new', 'venue'];
    const identifier = words
        .map((word, index) =>
            index
                ? word[0].toUpperCase() + word.slice(1).toLowerCase()
                : word.toLowerCase()
        )
        .join('');
    return `${/^[a-z]/.test(identifier) ? identifier : `venue${identifier}`}Cinema.ts`;
}
export function suggestJsonMapping(sample: unknown): Partial<ScraperConfig> {
    const find = (
        value: unknown,
        prefix = '$',
        depth = 0
    ): { items: unknown[]; path: string } | null => {
        if (depth > 5 || !value || typeof value !== 'object') return null;
        if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
            const keys = Object.keys(value[0]);
            if (
                keys.some((key) =>
                    /^(title|name|filmTitle|movieTitle|titolo)$/i.test(key)
                )
            )
                return { items: value, path: prefix };
        }
        for (const [key, item] of Object.entries(value)) {
            const result = find(
                item,
                prefix === '$' ? key : `${prefix}.${key}`,
                depth + 1
            );
            if (result) return result;
        }
        return null;
    };
    const match = find(sample);
    if (!match) return {};
    const film = match.items[0] as Record<string, unknown>;
    const field = (object: Record<string, unknown>, candidates: string[]) => {
        const key =
            candidates.find(
                (key) =>
                    key in object &&
                    (key !== 'author' || typeof object[key] === 'string')
            ) ?? '';
        const value = object[key];
        const nested =
            value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : null;
        const rendered = nested && typeof nested.rendered === 'string';
        return {
            path:
                key +
                (rendered
                    ? '.rendered'
                    : nested && typeof nested.url === 'string'
                      ? '.url'
                      : ''),
            attribute: '',
            ...(rendered ? { htmlText: true } : {}),
        };
    };
    const showings =
        Object.keys(film).find(
            (key) =>
                Array.isArray(film[key]) &&
                /session|screening|showing|event/i.test(key)
        ) ?? '';
    const showing = showings
        ? ((film[showings] as Record<string, unknown>[])[0] ?? {})
        : film;
    const start = field(showing, [
        'start_time',
        'startTime',
        'start',
        'datetime',
        'dateTime',
        'time',
        'inizio',
    ]);
    const rawStart = showing[start.path];
    const epoch =
        (typeof rawStart === 'number' || typeof rawStart === 'string') &&
        /^\d{10,13}(?:\.\d+)?$/.test(String(rawStart))
            ? Number(rawStart)
            : null;
    return {
        items: match.path,
        title: field(film, [
            'title',
            'filmTitle',
            'movieTitle',
            'name',
            'titolo',
        ]),
        filmUrl: field(film, ['url', 'link', 'filmUrl']),
        director: field(film, ['director', 'author', 'autore']),
        poster:
            film.rttpg_featured_image_url &&
            typeof film.rttpg_featured_image_url === 'object'
                ? { path: 'rttpg_featured_image_url.full.0', attribute: '' }
                : field(film, ['poster', 'posterUrl', 'coverUrl', 'image']),
        showings,
        start,
        dateFormat:
            epoch === null
                ? ''
                : epoch >= 100000000000
                  ? 'unix-ms'
                  : 'unix-seconds',
        date:
            start.path || showings
                ? field(showing, ['date', 'day'])
                : { path: '', attribute: '' },
        booking: field(showing, ['booking_url', 'bookingUrl', 'url', 'link']),
    };
}

export function firstFilmLink(sample: unknown, config: ScraperConfig): string {
    const at = (value: unknown, path: string): unknown =>
        !path || path === '$'
            ? value
            : path
                  .split('.')
                  .reduce<unknown>(
                      (value, key) =>
                          value &&
                          typeof value === 'object' &&
                          !['__proto__', 'prototype', 'constructor'].includes(
                              key
                          )
                              ? (value as Record<string, unknown>)[key]
                              : undefined,
                      value
                  );
    const items = at(sample, config.items);
    const value = Array.isArray(items)
        ? at(items[0], config.filmUrl.path)
        : null;
    if (typeof value !== 'string' || !value) return '';
    try {
        const url = new URL(value, config.url);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

export interface SelectionMessage {
    type: 'cinema-selection';
    collection: string;
    documentPath: string;
    filmPath: string;
    showingPath: string;
    ancestorPath?: string;
    attributes: { datetime?: string; href?: string; src?: string };
    text: string;
}

export function selectionDocument(html: string, nonce: string) {
    // The frame has an opaque origin, a restrictive CSP and no external resources.
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none'"><style>body{font:15px/1.6 system-ui;padding:16px;color:#202020;background:#fafafa}article,section,li{padding:8px;border:1px solid #ddd;margin:6px 0}a,time{color:#b91c1c}*:hover{outline:2px solid #dc2626;cursor:crosshair}img{display:none}</style></head><body>${html}<script nonce="${nonce}">
let filmSelector='', showingSelector='', ancestorSelector='';
addEventListener('message', event=>{if(event.source===parent && event.data?.type==='cinema-scope'){filmSelector=event.data.film;showingSelector=event.data.showings;ancestorSelector=event.data.ancestor;}});
function token(el){return el.tagName.toLowerCase()+[...el.classList].filter(c=>/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(c)).slice(0,2).map(c=>'.'+CSS.escape(c)).join('');}
function selector(el,scope){if(el===scope)return '$self';if(scope===document.body && el.id && document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return '#'+CSS.escape(el.id);const parts=[];for(let node=el;node&&node!==scope&&node!==document.body;node=node.parentElement){let value=token(node);if(node.parentElement?.querySelectorAll(':scope > '+value).length>1)value+=':nth-of-type('+([...node.parentElement.children].filter(s=>s.tagName===node.tagName).indexOf(node)+1)+')';parts.unshift(value);}return parts.join(' > ')||token(el);}
addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const target=event.target;if(!(target instanceof Element))return;const el=event.altKey?(target.parentElement??target):target;let film=null,showing=null,ancestor=null;try{film=filmSelector?el.closest(filmSelector):null;showing=showingSelector?el.closest(showingSelector):null;ancestor=ancestorSelector?el.closest(ancestorSelector):null;}catch{}parent.postMessage({type:'cinema-selection',collection:token(el),documentPath:selector(el,document.body),filmPath:selector(el,film??document.body),showingPath:selector(el,showing??film??document.body),ancestorPath:ancestor?selector(el,ancestor):undefined,attributes:{datetime:el.getAttribute('datetime')??undefined,href:el.getAttribute('data-builder-href')??undefined,src:el.getAttribute('data-builder-src')??undefined},text:el.textContent?.trim().slice(0,160)??''},'*');},true);
</script></body></html>`;
}
