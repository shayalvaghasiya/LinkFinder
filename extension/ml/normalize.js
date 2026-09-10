/**
 * Deterministic normalization helpers (browser-only).
 *
 * Ported conceptually from backend/utils/normalization.py
 */

const DEFAULT_REFERENCE = () => new Date();

function cleanTextInternal(v) {
    if (!v) return '';
    return String(v).replace(/\s+/g, ' ').trim();
}

function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    return crypto.subtle.digest('SHA-256', data).then(digest => {
        const bytes = new Uint8Array(digest);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

export function cleanText(v) {
    return cleanTextInternal(v);
}

// Back-compat alias (some modules may import/expect a cleanText symbol).
export const clean = cleanText;

/**
 * Parse LinkedIn posting time text into a Date.
 *
 * @returns {{ date: Date | null, confidence: number }}
 */
export function parseLinkedInTimestamp(postedText, referenceDate = DEFAULT_REFERENCE()) {
    const text = cleanTextInternal(postedText).toLowerCase();
    if (!text) return { date: null, confidence: 0 };

    const referenceTime = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

    // Just now / moments ago
    if (["just now", "moments ago", "now"].some(k => text.includes(k))) {
        return { date: referenceTime, confidence: 0.95 };
    }

    // Patterns: "4 hours ago", "1 day ago", "3 weeks ago"
    let match = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i);

    if (!match) {
        // Try without "ago": "4 hours", "1 day"
        match = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?/i);
    }

    if (match) {
        const number = parseInt(match[1], 10);
        const unit = match[2];

        let deltaMs = 0;
        let confidence = 0;

        if (unit.startsWith('minute')) {
            deltaMs = number * 60 * 1000;
            confidence = 0.98;
        } else if (unit.startsWith('hour')) {
            deltaMs = number * 60 * 60 * 1000;
            confidence = 0.95;
        } else if (unit.startsWith('day')) {
            deltaMs = number * 24 * 60 * 60 * 1000;
            confidence = 0.90;
        } else if (unit.startsWith('week')) {
            deltaMs = number * 7 * 24 * 60 * 60 * 1000;
            confidence = 0.85;
        } else if (unit.startsWith('month')) {
            deltaMs = number * 30 * 24 * 60 * 60 * 1000; // approx
            confidence = 0.70;
        } else if (unit.startsWith('year')) {
            deltaMs = number * 365 * 24 * 60 * 60 * 1000; // approx
            confidence = 0.60;
        }

        if (!deltaMs || !confidence) return { date: null, confidence: 0 };

        return { date: new Date(referenceTime.getTime() - deltaMs), confidence };
    }

    // Fallback: attempt Date.parse on the raw string.
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) {
        return { date: new Date(parsed), confidence: 0.99 };
    }

    return { date: null, confidence: 0 };
}

export function normalizeLocation(location) {
    const loc = cleanTextInternal(location);
    if (!loc) return '';

    let normalized = loc.split(/\s+/).join(' ');
    normalized = normalized.replace(/\(Remote\)/gi, 'Remote');
    normalized = normalized.replace(/\(Hybrid\)/gi, 'Hybrid');

    return cleanTextInternal(normalized);
}

export function parseExperienceRequirement(experienceText) {
    const text = cleanTextInternal(experienceText).toLowerCase();
    if (!text) return { minYears: null, maxYears: null };

    if (["entry level", "entry-level", "no experience"].some(k => text.includes(k))) {
        return { minYears: 0, maxYears: 1 };
    }

    if (text.includes('intern')) {
        return { minYears: 0, maxYears: 0.5 };
    }

    if (text.includes('mid level') || text.includes('mid-level')) {
        return { minYears: 3, maxYears: 6 };
    }

    if (text.includes('senior')) {
        return { minYears: 5, maxYears: null };
    }

    const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-to]+\s*(\d+(?:\.\d+)?)/i);
    if (rangeMatch) {
        return {
            minYears: parseFloat(rangeMatch[1]),
            maxYears: parseFloat(rangeMatch[2])
        };
    }

    const plusMatch = text.match(/(\d+(?:\.\d+)?)\s*\+|(?:(\d+(?:\.\d+)?))\s*or\s+more/i);
    if (plusMatch) {
        const minYears = parseFloat(plusMatch[1] || plusMatch[2]);
        return { minYears, maxYears: null };
    }

    const singleMatch = text.match(/(\d+(?:\.\d+)?)/i);
    if (singleMatch) {
        const years = parseFloat(singleMatch[1]);
        return { minYears: years, maxYears: years };
    }

    return { minYears: null, maxYears: null };
}

export function extractLinkedInId(url) {
    if (!url) return null;

    const jobMatch = url.match(/\/jobs\/view\/(\d+)/);
    if (jobMatch) return jobMatch[1];

    const postMatch = url.match(/\/posts\/[^/]+-(\d+)/);
    if (postMatch) return postMatch[1];

    return null;
}

export async function generateFingerprint({ title, company, location, url }) {
    const normalized = [
        cleanTextInternal(title).toLowerCase(),
        cleanTextInternal(company).toLowerCase(),
        cleanTextInternal(location || '').toLowerCase(),
        cleanTextInternal(url || '').toString()
    ];

    const combined = normalized.join('|');
    const hashHex = await sha256Hex(combined);
    return hashHex.slice(0, 16);
}
