/**
 * In-browser LLM reasoning.
 *
 * Uses transformers.js text-generation pipeline when possible.
 * Falls back to heuristics when the model cannot load.
 */

let llmLoadPromise = null;

async function ensureTransformersLoaded() {
    if (globalThis.__linkfinderTransformersLoaded) {
        return globalThis.__linkfinderTransformers;
    }

    if (llmLoadPromise) return llmLoadPromise;

    llmLoadPromise = new Promise((resolve, reject) => {
        const hasScript = document.querySelector('script[data-linkfinder-transformers]');

        // If transformers is already present, mark ready.
        if (globalThis.transformers && !globalThis.__linkfinderTransformersLoaded) {
            globalThis.__linkfinderTransformers = globalThis.transformers;
            globalThis.__linkfinderTransformersLoaded = true;
            resolve(globalThis.__linkfinderTransformers);
            return;
        }

        // If script was injected by embeddings.js, wait a tick.
        if (hasScript) {
            setTimeout(() => {
                globalThis.__linkfinderTransformers = globalThis.transformers || globalThis;
                globalThis.__linkfinderTransformersLoaded = true;
                resolve(globalThis.__linkfinderTransformers);
            }, 10);
            return;
        }

        // Otherwise inject from CDN (popup-only).
        const script = document.createElement('script');
        script.async = true;
        script.dataset.linkfinderTransformers = '1';
        script.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.15.1/dist/transformers.min.js';

        script.onload = () => {
            globalThis.__linkfinderTransformers = globalThis.transformers || globalThis;
            globalThis.__linkfinderTransformersLoaded = true;
            resolve(globalThis.__linkfinderTransformers);
        };
        script.onerror = (e) => reject(e);

        document.head.appendChild(script);
    });

    return llmLoadPromise;
}

function heuristicIsJobOpportunity(text) {
    const t = (text || '').toLowerCase();
    if (!t.trim()) return false;

    const keywords = [
        'hiring', 'we are hiring', 'apply', 'job opening', 'opportunity',
        'position', 'role', 'engineer', 'developer', 'intern',
        'remote', 'hybrid'
    ];

    return keywords.some(k => t.includes(k));
}

function safeJsonParse(text) {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    const raw = match ? match[0] : text;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

export async function classifyOpportunity({ text, maxNewTokens = 64 } = {}) {
    const inputText = (text || '').toString();
    const heuristic = heuristicIsJobOpportunity(inputText);

    try {
        const transformers = await ensureTransformersLoaded();
        if (!transformers || !transformers.pipeline) throw new Error('transformers.pipeline not available');

        if (!globalThis.__linkfinderLlmPipeline) {
            globalThis.__linkfinderLlmPipeline = await transformers.pipeline('text-generation', 'Xenova/phi-2', {
                dtype: 'fp16',
                device: 'webgpu'
            });
        }

        const prompt = `You are a job opportunity classifier.\n\nReturn ONLY valid JSON with this schema:\n{ "is_job_opportunity": boolean }\n\nText:\n${inputText}\n`;

        const out = await globalThis.__linkfinderLlmPipeline(prompt, {
            max_new_tokens: maxNewTokens,
            temperature: 0.1,
            do_sample: false
        });

        const generated = Array.isArray(out) ? (out[0]?.generated_text || '') : (out?.generated_text || '');
        const parsed = safeJsonParse(generated);
        if (parsed && typeof parsed.is_job_opportunity === 'boolean') {
            return parsed.is_job_opportunity;
        }

        return heuristic;
    } catch {
        return heuristic;
    }
}

export async function analyzeMatch({ profile, opportunity, maxNewTokens = 180 } = {}) {
    const roles = profile?.profile_data?.roles || [];
    const skillsStrong = profile?.profile_data?.skills?.strong || [];
    const skillsWorking = profile?.profile_data?.skills?.working || [];
    const skillsFamiliar = profile?.profile_data?.skills?.familiar || [];

    const profileSkills = [...skillsStrong, ...skillsWorking, ...skillsFamiliar];

    const prompt = `You are an assistant that scores and explains how well a job posting matches a candidate profile.\n\nReturn ONLY valid JSON with this schema:\n{\n  "match_score": number,\n  "role_match": string,\n  "skill_match": string,\n  "missing_skills": string[],\n  "strengths": string[],\n  "summary": string\n}\n\nCandidate profile:\n- Roles of interest: ${roles.join(', ')}\n- Skills: ${profileSkills.join(', ')}\n- Experience years: ${profile?.profile_data?.experience_years ?? 0}\n- Locations: ${(profile?.profile_data?.locations || []).join(', ')}\n\nOpportunity:\n- Title: ${opportunity?.title || ''}\n- Company: ${opportunity?.company || ''}\n- Location: ${opportunity?.location || ''}\n- Posted: ${opportunity?.posted_text || ''}\n- Content/Text: ${(opportunity?.content || opportunity?.posted_text || '').slice(0, 1200)}\n\nInstructions:\n- match_score must be 0-100.\n- missing_skills should be up to 6 short items.\n- strengths up to 6 short items.\n`;

    try {
        const transformers = await ensureTransformersLoaded();
        if (!transformers || !transformers.pipeline) throw new Error('transformers.pipeline not available');

        if (!globalThis.__linkfinderLlmReasonPipeline) {
            globalThis.__linkfinderLlmReasonPipeline = await transformers.pipeline('text-generation', 'Xenova/phi-2', {
                dtype: 'fp16',
                device: 'webgpu'
            });
        }

        const out = await globalThis.__linkfinderLlmReasonPipeline(prompt, {
            max_new_tokens: maxNewTokens,
            temperature: 0.2,
            do_sample: false
        });

        const generated = Array.isArray(out) ? (out[0]?.generated_text || '') : (out?.generated_text || '');
        const parsed = safeJsonParse(generated);
        if (!parsed) throw new Error('JSON parse failed');

        if (typeof parsed.match_score !== 'number') throw new Error('match_score missing');

        parsed.missing_skills = Array.isArray(parsed.missing_skills) ? parsed.missing_skills : [];
        parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
        parsed.role_match = parsed.role_match ?? '';
        parsed.skill_match = parsed.skill_match ?? '';
        parsed.summary = parsed.summary ?? '';

        return parsed;
    } catch {
        return {
            match_score: 50,
            role_match: 'Heuristic role match',
            skill_match: 'Heuristic skill match',
            missing_skills: [],
            strengths: ['Local rule-based match'],
            summary: `Matched by title/company signals for ${opportunity?.title || 'opportunity'}.`
        };
    }
}
