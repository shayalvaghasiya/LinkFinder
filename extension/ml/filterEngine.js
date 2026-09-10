/**
 * Deterministic filtering engine (freshness → location → role → experience → employment).
 *
 * Rule-based and must run BEFORE any embeddings/LLM work.
 */

import {
    parseLinkedInTimestamp,
    normalizeLocation,
    parseExperienceRequirement,
    cleanText
} from './normalize.js';

function parseFreshnessToMs(freshness) {
    const f = (freshness || '24h').toString().toLowerCase().trim();
    if (f.endsWith('h')) {
        const n = parseFloat(f.replace('h', ''));
        return n * 60 * 60 * 1000;
    }
    if (f.endsWith('d')) {
        const n = parseFloat(f.replace('d', ''));
        return n * 24 * 60 * 60 * 1000;
    }

    // Fallback: treat as hours
    const asNum = parseFloat(f);
    return Number.isFinite(asNum) ? asNum * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

function tokensFromList(items = []) {
    return (items || [])
        .filter(Boolean)
        .map(x => cleanText(x).toLowerCase())
        .flatMap(x => String(x).split(/[,/\|]/g).map(s => cleanText(s)))
        .filter(Boolean);
}

function scoreRoleMatch({ title, company }, rolesTokens = []) {
    const t = cleanText(title).toLowerCase();
    const c = cleanText(company).toLowerCase();

    if (!rolesTokens.length) return { eligible: true, score: 100 };

    const hit = rolesTokens.some(rt => t.includes(rt) || c.includes(rt));
    return { eligible: hit, score: hit ? 100 : 0 };
}

function scoreLocationMatch(location, allowedLocations = []) {
    const loc = normalizeLocation(location).toLowerCase();
    if (!allowedLocations.length) return { eligible: true, score: 100 };

    const normalizedAllowed = allowedLocations.map(l => normalizeLocation(l).toLowerCase());

    const hit = normalizedAllowed.some(al =>
        loc.includes(al) ||
        al.includes(loc) ||
        (al === 'remote' && loc.includes('remote'))
    );

    return { eligible: hit, score: hit ? 100 : 0 };
}

function experienceEligibility(experienceYears, requirementText) {
    // If we don't have a requirement, treat as pass.
    if (!requirementText) {
        return { eligible: true, score: 100 };
    }

    const { minYears, maxYears } = parseExperienceRequirement(requirementText);
    if (minYears === null && maxYears === null) {
        return { eligible: true, score: 100 };
    }

    const exp = parseFloat(experienceYears);
    if (!Number.isFinite(exp)) return { eligible: true, score: 100 };

    if (maxYears === null) {
        const hit = exp >= minYears;
        return { eligible: hit, score: hit ? 100 : 0 };
    }

    const hit = exp >= minYears && exp <= maxYears;
    return { eligible: hit, score: hit ? 100 : 0 };
}

/**
 * @param {object} opportunity normalized/structured job/post
 * @param {object} profile profile_payload
 * @param {object} searchConfig {freshness, locations, roles}
 */
export function filterOpportunity(opportunity, profile, searchConfig) {
    const now = new Date();
    const freshnessMs = parseFreshnessToMs(searchConfig.freshness);
    const cutoff = new Date(now.getTime() - freshnessMs);

    const postedText = cleanText(opportunity.posted_text);
    const { date: postedAt, confidence } = parseLinkedInTimestamp(postedText, now);

    // Deterministic freshness: require parseable timestamp.
    if (!postedAt) {
        return {
            eligible: false,
            reasons: ['unparseable_posted_time'],
            freshness: { eligible: false, postedAt: null, confidence },
            scores: {
                role: 0,
                location: 0,
                experience: 0
            }
        };
    }

    const freshnessEligible = postedAt.getTime() >= cutoff.getTime();
    if (!freshnessEligible) {
        return {
            eligible: false,
            reasons: ['stale_by_freshness'],
            freshness: { eligible: false, postedAt, confidence },
            scores: {
                role: 0,
                location: 0,
                experience: 0
            }
        };
    }

    const rolesTokens = tokensFromList(searchConfig.roles || []);
    const locationAllowed = searchConfig.locations || [];

    const roleMatch = scoreRoleMatch({ title: opportunity.title, company: opportunity.company }, rolesTokens);
    if (!roleMatch.eligible) {
        return {
            eligible: false,
            reasons: ['role_mismatch'],
            freshness: { eligible: true, postedAt, confidence },
            scores: {
                role: 0,
                location: 0,
                experience: 0
            }
        };
    }

    const locationMatch = scoreLocationMatch(opportunity.location, locationAllowed);
    if (!locationMatch.eligible) {
        return {
            eligible: false,
            reasons: ['location_mismatch'],
            freshness: { eligible: true, postedAt, confidence },
            scores: {
                role: roleMatch.score,
                location: 0,
                experience: 0
            }
        };
    }

    const experienceText = opportunity.experience_text || null;
    const { eligible: expEligible, score: expScore } = experienceEligibility(
        profile?.profile_data?.experience_years ?? 0,
        experienceText
    );

    if (!expEligible) {
        return {
            eligible: false,
            reasons: ['experience_mismatch'],
            freshness: { eligible: true, postedAt, confidence },
            scores: {
                role: roleMatch.score,
                location: locationMatch.score,
                experience: 0
            }
        };
    }

    return {
        eligible: true,
        reasons: [],
        freshness: { eligible: true, postedAt, confidence },
        scores: {
            role: roleMatch.score,
            location: locationMatch.score,
            experience: expScore
        }
    };
}
