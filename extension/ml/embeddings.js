/**
 * In-browser embeddings.
 *
 * Uses transformers.js (Xenova) from jsDelivr when available.
 * Falls back to deterministic token-overlap similarity if the model cannot load.
 */

let transformersLoadPromise = null;

async function loadTransformers() {
    if (globalThis.__linkfinderTransformersLoaded) {
        return globalThis.__linkfinderTransformers;
    }

    if (transformersLoadPromise) return transformersLoadPromise;

    transformersLoadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-linkfinder-transformers]');
        if (existing) {
            setTimeout(() => resolve(globalThis.__linkfinderTransformers), 50);
            return;
        }

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

    return transformersLoadPromise;
}

function cosineSimilarity(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function normalizeVec(vec) {
    const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    if (!n) return vec;
    return vec.map(x => x / n);
}

function tokenOverlapSimilarity(a, b) {
    const A = new Set((a || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const B = new Set((b || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    if (!A.size || !B.size) return 0;

    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    const union = A.size + B.size - inter;
    return union ? inter / union : 0;
}

async function embedText(text, modelName = 'Xenova/all-MiniLM-L6-v2') {
    const t = (text || '').toString();
    if (!t.trim()) return null;

    try {
        const transformers = await loadTransformers();
        if (!transformers || !transformers.pipeline) throw new Error('transformers.pipeline not available');

        if (!globalThis.__linkfinderEmbedPipeline) {
            globalThis.__linkfinderEmbedPipeline = await transformers.pipeline('feature-extraction', modelName, {
                quantized: false
            });
        }

        const out = await globalThis.__linkfinderEmbedPipeline(t, {
            pooling: 'mean',
            normalize: true
        });

        const vec = Array.isArray(out) ? (out[0]?.data || out[0]) : (out?.data || out);
        if (!vec) throw new Error('embedding output not recognized');

        const arr = Array.from(vec).map(Number);
        return normalizeVec(arr);
    } catch {
        // Deterministic hashed pseudo-vector fallback.
        const tokens = t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        if (!tokens.length) return null;

        const dim = 128;
        const vec = new Array(dim).fill(0);
        for (const token of tokens.slice(0, 200)) {
            let h = 0;
            for (let i = 0; i < token.length; i++) {
                h = (h * 31 + token.charCodeAt(i)) >>> 0;
            }
            vec[h % dim] += 1;
        }
        return normalizeVec(vec);
    }
}

export async function similarityBetweenTexts(textA, textB) {
    const [a, b] = await Promise.all([embedText(textA), embedText(textB)]);
    if (!a || !b) return tokenOverlapSimilarity(textA || '', textB || '');

    try {
        return cosineSimilarity(a, b);
    } catch {
        return tokenOverlapSimilarity(textA || '', textB || '');
    }
}
