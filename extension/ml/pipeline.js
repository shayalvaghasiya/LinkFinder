/**
 * Browser-only end-to-end pipeline:
 * extraction objects -> normalization/filter -> embeddings/LLM -> ranking/dedup
 */

import { filterOpportunity } from './filterEngine.js';
import { similarityBetweenTexts } from './embeddings.js';
import { classifyOpportunity, analyzeMatch } from './llm.js';
import { computeFinalScore } from './rankingEngine.js';
import { generateFingerprint, normalizeLocation, cleanText } from './normalize.js';
import { hasFingerprint, bulkUpsert } from './dedupStore.js';

function unifyOpportunity(item, kind) {
    // Jobs extractor returns {title, company, location, url, posted_text}
    // Feed extractor returns {author, post_url, posted_text, content}
    if (kind === 'job') {
        return {
            kind: 'job',
            title: item.title || '',
            company: item.company || '',
            location: normalizeLocation(item.location || ''),
            url: item.url || item.job_url || '',
            posted_text: item.posted_text || '',
            content: item.description || item.posted_text || '',
            employment_type: item.employment_type || null,
            experience_text: item.experience_text || null,
            raw: item
        };
    }

    return {
        kind: 'post',
        title: item.title || item.author || 'Job Opportunity',
        company: item.company || item.author || '',
        location: normalizeLocation(item.location || ''),
        url: item.post_url || item.url || '',
        posted_text: item.posted_text || '',
        content: item.content || item.posted_text || '',
        employment_type: null,
        experience_text: null,
        raw: item
    };
}

function computeCandidateText(profile) {
    const pd = profile?.profile_data || {};
    const roles = pd.roles || [];
    const skills = [
        ...(pd.skills?.strong || []),
        ...(pd.skills?.working || []),
        ...(pd.skills?.familiar || [])
    ];

    return {
        profileRoleText: roles.join(' '),
        profileSkillText: skills.join(' '),
        profileLocationText: (pd.locations || []).join(' ')
    };
}

export async function pipelineRun({ jobs, posts, profile, searchConfig } = {}) {
    const t0 = performance.now();

    const unifiedJobs = (jobs || []).map(j => unifyOpportunity(j, 'job'));
    const unifiedPosts = (posts || []).map(p => unifyOpportunity(p, 'post'));

    const total_received = unifiedJobs.length + unifiedPosts.length;

    // 1) deterministic filter
    const candidates = [];
    const filteredOut = [];

    for (const op of [...unifiedJobs, ...unifiedPosts]) {
        const filterRes = filterOpportunity(op, profile, searchConfig);
        if (!filterRes.eligible) {
            filteredOut.push({ op, reasons: filterRes.reasons });
            continue;
        }
        candidates.push({ op, filterRes });
    }

    const total_filtered = filteredOut.length;

    // 2) job-post classification for posts
    const postClassified = [];
    for (const c of candidates) {
        if (c.op.kind === 'post') {
            const isJob = await classifyOpportunity({ text: c.op.content || c.op.posted_text || '' });
            if (!isJob) continue;
        }
        postClassified.push(c);
    }

    // 3) dedup fingerprinting
    const dedupedCandidates = [];
    for (const c of postClassified) {
        if (!c.op.url) continue;

        const fingerprint = await generateFingerprint({
            title: c.op.title,
            company: c.op.company,
            location: c.op.location,
            url: c.op.url
        });

        const already = await hasFingerprint(fingerprint);
        if (already) continue;

        dedupedCandidates.push({ ...c, fingerprint });
    }

    // 4) embeddings semantic similarity
    const { profileRoleText, profileSkillText } = computeCandidateText(profile);

    for (const c of dedupedCandidates) {
        const opportunityText = [c.op.title, c.op.company, c.op.location, c.op.content].filter(Boolean).join(' ');
        const similarity = await similarityBetweenTexts(profileSkillText || profileRoleText, opportunityText);
        c.semantic = { similarity };
    }

    const ranked = dedupedCandidates
        .map(c => {
            const scores = computeFinalScore({
                opportunity: c.op,
                profile,
                ruleScores: {
                    role: c.filterRes.scores.role,
                    location: c.filterRes.scores.location,
                    experience: c.filterRes.scores.experience
                },
                semantic: c.semantic
            });

            return {
                op: c.op,
                fingerprint: c.fingerprint,
                filterRes: c.filterRes,
                semantic: c.semantic,
                scores
            };
        })
        .sort((a, b) => b.scores.final_score - a.scores.final_score);

    const topN = 8;
    const top = ranked.slice(0, topN);

    // 5) LLM match analysis for top-N
    const matches = [];
    for (const item of top) {
        const analysis = await analyzeMatch({
            profile,
            opportunity: { ...item.op, content: item.op.content }
        });

        const postedAtIso = item.filterRes.freshness.postedAt
            ? item.filterRes.freshness.postedAt.toISOString()
            : null;

        matches.push({
            type: item.op.kind,
            title: item.op.title,
            company: item.op.company,
            location: item.op.location,
            posted_at: postedAtIso,
            url: item.op.url,
            final_score: item.scores.final_score,
            role_score: item.scores.role_score,
            skill_score: item.scores.skill_score,
            experience_score: item.scores.experience_score,
            location_score: item.scores.location_score,
            analysis: {
                match_score: analysis.match_score,
                role_match: analysis.role_match,
                skill_match: analysis.skill_match,
                missing_skills: analysis.missing_skills,
                strengths: analysis.strengths,
                summary: analysis.summary
            },
            posted_text: item.op.posted_text
        });
    }

    // 6) persist fingerprints for dedup (after processing succeeds)
    try {
        const toStore = dedupedCandidates.map(c => ({
            fingerprint: c.fingerprint,
            url: c.op.url,
            title: cleanText(c.op.title),
            company: cleanText(c.op.company),
            location: cleanText(c.op.location),
            scanned_at: new Date().toISOString()
        }));

        await bulkUpsert(toStore);
    } catch {
        // Non-fatal.
    }

    const total_matched = matches.length;
    const processing_time_seconds = (performance.now() - t0) / 1000;

    return {
        total_received,
        total_filtered,
        total_matched,
        processing_time_seconds,
        matches
    };
}
