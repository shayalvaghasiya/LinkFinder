/**
 * Best-effort local resume parsing (browser-only).
 *
 * For now we implement deterministic parsing from extracted text.
 * - Always supports .txt via FileReader
 * - PDF/DOCX support can be added later (needs extra parsing libs)
 */

import { cleanText } from '../ml/normalize.js';

function splitLines(text) {
    return String(text || '')
        .split(/\r?\n/)
        .map(l => cleanText(l))
        .filter(Boolean);
}

function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}

function parseExperienceYears(text) {
    const t = cleanText(text).toLowerCase();

    // Common patterns: "X years", "X+ years", "X.Y years"
    const m = t.match(/(\d+(?:\.\d+)?)\s*(\+\s*)?years?/i);
    if (m) {
        const v = Number.parseFloat(m[1]);
        if (Number.isFinite(v)) return v;
    }

    // Fallback: "\d+ year" without the word "years"
    const m2 = t.match(/(\d+(?:\.\d+)?)\s*year\b/i);
    if (m2) {
        const v = Number.parseFloat(m2[1]);
        if (Number.isFinite(v)) return v;
    }

    return 0;
}

function guessLocations(text) {
    const t = cleanText(text);
    if (!t) return [];

    const tokens = [
        'remote',
        'hybrid',
        'united states',
        'canada',
        'india',
        'europe',
        'uk',
        'united kingdom',
        'singapore',
        'australia'
    ];

    // If the resume contains "Remote" anywhere, include it.
    const locs = [];
    if (t.toLowerCase().includes('remote')) locs.push('Remote');
    if (t.toLowerCase().includes('hybrid')) locs.push('Hybrid');

    for (const tok of tokens) {
        if (tok === 'remote' || tok === 'hybrid') continue;
        if (t.toLowerCase().includes(tok.toLowerCase())) {
            locs.push(tok.replace(/\b(united kingdom|uk)\b/i, 'UK'));
        }
    }

    // City/state heuristic: pick up capitalized tokens in "Location:" style lines.
    const lines = splitLines(t);
    for (const line of lines.slice(0, 40)) {
        const lc = line.toLowerCase();
        if (lc.startsWith('location:') || lc.startsWith('locations:')) {
            const after = line.split(':').slice(1).join(':');
            if (after) {
                locs.push(...after.split(/,|\/|;/).map(s => cleanText(s)));
            }
        }
        if (lc.startsWith('based in') || lc.startsWith('based:')) {
            const after = line.split(':').slice(1).join(':');
            if (after) locs.push(...after.split(/,|\/|;/).map(s => cleanText(s)));
        }
    }

    return uniq(locs).slice(0, 8);
}

function extractSkills(text) {
    const t = String(text || '');
    if (!t.trim()) return { strong: [], working: [], familiar: [] };

    // Heuristic: find a "Skills" or "Technology" section and then split by commas/newlines.
    const headings = ['skills', 'technologies', 'technology', 'tooling', 'stack', 'core skills', 'technical skills'];

    const lower = t.toLowerCase();
    let startIdx = -1;
    let heading = '';

    for (const h of headings) {
        const idx = lower.indexOf(h);
        if (idx !== -1) {
            startIdx = idx;
            heading = h;
            break;
        }
    }

    // If no heading, fall back to scanning for frequent short tokens (limited effort).
    if (startIdx === -1) {
        const lines = splitLines(t);
        const flat = lines.join(' ');
        const chunks = flat.split(/,|\n|\/|\|/).map(s => cleanText(s));
        const skills = chunks
            .filter(s => s.length >= 2 && s.length <= 28)
            .slice(0, 40);
        return {
            strong: uniq(skills).slice(0, 10),
            working: [],
            familiar: []
        };
    }

    // Take substring after the first heading occurrence.
    const after = t.slice(startIdx + heading.length);
    const lines = splitLines(after);

    // Stop at common next sections.
    const stopWords = ['experience', 'work experience', 'projects', 'education', 'certifications', 'summary', 'about'];
    const captured = [];

    for (const line of lines) {
        const lc = line.toLowerCase();
        if (stopWords.some(sw => lc.startsWith(sw))) break;
        captured.push(line);
        if (captured.join(' ').length > 1200) break;
    }

    const chunkText = captured.join(' ');

    // Split by commas/semicolons or by repeated spaces.
    const rawSkills = chunkText
        .split(/,|;|\n|\/|\||•/)
        .map(s => cleanText(s))
        .filter(Boolean);

    // Normalize & dedup
    const skills = uniq(rawSkills)
        .filter(s => s.length >= 2)
        .map(s => s.replace(/^[-•\s]+/, ''));

    // Simple grading:
    // - Strong: longer tokens / those that look like technologies
    // - Working: the rest
    const strong = skills
        .filter(s => s.length >= 3)
        .slice(0, 10);

    const remaining = skills.filter(s => !strong.includes(s));

    const working = remaining.slice(0, 10);

    return {
        strong,
        working,
        familiar: []
    };
}

function fallbackNameFromText(text) {
    const lines = splitLines(text);
    if (!lines.length) return '';

    // Try first non-empty line that isn't "summary"/"skills"
    for (const line of lines.slice(0, 10)) {
        const lc = line.toLowerCase();
        if (lc.startsWith('skills') || lc.startsWith('technology') || lc.startsWith('summary')) continue;
        if (line.length >= 3 && line.length <= 80) return line.slice(0, 60);
    }

    return '';
}

export async function parseResumeFile(file) {
    const ext = (file?.name || '').toLowerCase();

    // Always support .txt
    if (ext.endsWith('.txt') || file.type === 'text/plain') {
        const text = await file.text();
        return parseResumeText(text, { fileName: file.name });
    }

    // Best-effort: for PDFs/DOCX we do not include heavy parsing libs.
    // Provide a clear message.
    return {
        profilePayload: null,
        warnings: ['PDF/DOCX parsing is not implemented in this version. Please upload a .txt resume or paste text.'],
        rawText: null
    };
}

export async function parseResumeText(text, { fileName } = {}) {
    const cleaned = cleanText(text);

    const experience_years = parseExperienceYears(cleaned);
    const locations = guessLocations(cleaned);
    const skills = extractSkills(cleaned);

    // Roles: pick up common role-like lines from early resume sections.
    // Deterministic heuristic: take lines with keywords.
    const keywords = ['engineer', 'developer', 'sre', 'devops', 'cloud', 'architect', 'manager', 'lead'];
    const lines = splitLines(cleaned);
    const roles = [];

    for (const line of lines.slice(0, 40)) {
        const lc = line.toLowerCase();
        if (keywords.some(k => lc.includes(k))) {
            roles.push(line.slice(0, 60));
        }
        if (roles.length >= 5) break;
    }

    const name = fallbackNameFromText(cleaned) || 'Imported Profile';

    return {
        profilePayload: {
            name,
            profile_data: {
                roles: uniq(roles).slice(0, 5),
                experience_years,
                skills: {
                    strong: skills.strong || [],
                    working: skills.working || [],
                    familiar: skills.familiar || []
                },
                locations
            }
        },
        warnings: fileName ? [`Parsed from ${fileName}`] : [],
        rawText: null
    };
}
