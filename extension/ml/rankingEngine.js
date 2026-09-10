/**
 * Ranking engine.
 *
 * Deterministic scoring from:
 * - rule scores (role/location/experience)
 * - embedding similarity (profile vs opportunity)
 * - freshness already enforced by filter
 */

function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

function similarityToPercent(sim) {
    // sim may be [-1,1] for cosine, or [0,1] for token overlap. Map into 0..1.
    const s = (sim + 1) / 2;
    return Math.round(clamp01(s) * 100);
}

export function computeFinalScore({ ruleScores, semantic } = {}) {
    const roleScore = ruleScores?.role ?? 0;
    const locationScore = ruleScores?.location ?? 0;
    const experienceScore = ruleScores?.experience ?? 0;

    const semanticSim = semantic?.similarity ?? 0;
    const skillScore = similarityToPercent(semanticSim);

    // Weighted blend (mirrors the backend concept).
    const final =
        0.35 * roleScore +
        0.25 * skillScore +
        0.15 * experienceScore +
        0.25 * locationScore;

    return {
        final_score: clamp01(final / 100) * 100,
        role_score: roleScore,
        skill_score: skillScore,
        experience_score: experienceScore,
        location_score: locationScore
    };
}
