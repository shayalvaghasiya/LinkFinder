/**
 * Popup application logic (browser-only ML pipeline).
 */

import { Storage } from '../storage/storage.js';
import { pipelineRun } from '../ml/pipeline.js';
import { DEFAULT_SCAN_LIMITS } from '../automation/scanConfig.js';

const scanBtn = document.getElementById('scanBtn');

// DOM elements
const analyzeBtn = document.getElementById('analyzeBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');
const status = document.getElementById('status');
const resultsSection = document.getElementById('resultsSection');
const resultStats = document.getElementById('resultStats');
const matchesContainer = document.getElementById('matchesContainer');
const scanJobsCheckbox = document.getElementById('scanJobs');
const scanPostsCheckbox = document.getElementById('scanPosts');
const freshnessSelect = document.getElementById('freshness');

// State
let currentProfile = null;

async function init() {
    currentProfile = await Storage.getActiveProfile();

    if (!currentProfile) {
        showStatus('⚠️ No profile found. Please create one in settings.', 'warning');
        analyzeBtn.disabled = true;
        if (scanBtn) scanBtn.disabled = true;
        return;
    }

    showStatus(`Profile: ${currentProfile.name}`, 'success');
}

function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
}

function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    if (scanBtn) scanBtn.disabled = isLoading;

    if (isLoading) {
        btnText.textContent = 'Processing...';
        btnLoader.style.display = 'inline-block';
    } else {
        btnText.textContent = 'Analyze Page';
        btnLoader.style.display = 'none';
    }
}

async function extractDataOnce() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('linkedin.com')) {
        throw new Error('Please open a LinkedIn page');
    }

    let jobs = [];
    let posts = [];

    if (scanJobsCheckbox.checked) {
        try {
            const jobsResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobs' });
            jobs = jobsResponse?.jobs || [];
        } catch (e) {
            console.warn('[LinkFinder] Jobs extraction not available on this page:', e);
        }
    }

    if (scanPostsCheckbox.checked) {
        try {
            const postsResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractPosts' });
            posts = postsResponse?.posts || [];
        } catch (e) {
            console.warn('[LinkFinder] Posts extraction not available on this page:', e);
        }
    }

    return { jobs, posts };
}

async function processData(jobs, posts, { searchConfigOverride = null } = {}) {
    const searchConfig =
        searchConfigOverride ||
        {
            freshness: freshnessSelect.value,
            locations: currentProfile.profile_data?.locations || [],
            roles: currentProfile.profile_data?.roles || []
        };

    return pipelineRun({
        jobs,
        posts,
        profile: currentProfile,
        searchConfig
    });
}

function displayResults(result) {
    resultStats.innerHTML = `
        <div>Received: ${result.total_received}</div>
        <div>Filtered: ${result.total_filtered}</div>
        <div>Matched: ${result.total_matched}</div>
        <div>Time: ${result.processing_time_seconds.toFixed(1)}s</div>
    `;

    matchesContainer.innerHTML = '';

    if (result.matches.length === 0) {
        matchesContainer.innerHTML = '<div class="no-results">No matches found</div>';
        resultsSection.style.display = 'block';
        return;
    }

    result.matches.forEach(match => {
        matchesContainer.appendChild(createMatchCard(match));
    });

    resultsSection.style.display = 'block';
}

function createMatchCard(match) {
    const card = document.createElement('div');
    card.className = 'match-card';

    const scoreClass = match.final_score >= 80 ? 'high' : match.final_score >= 60 ? 'medium' : 'low';

    const strengthsHtml = (match.analysis?.strengths || [])
        .slice(0, 6)
        .map(s => `<li>${s}</li>`)
        .join('');

    const missingSkillsHtml =
        match.analysis?.missing_skills && match.analysis.missing_skills.length > 0
            ? `
                <div class="missing-skills">
                    <strong>Missing:</strong> ${match.analysis.missing_skills.join(', ')}
                </div>
              `
            : '';

    const postedText = match.posted_at ? new Date(match.posted_at).toLocaleString() : 'Unknown';

    card.innerHTML = `
        <div class="match-header">
            <div class="match-score ${scoreClass}">${Math.round(match.final_score)}%</div>
            <div class="match-title">
                <h3>${match.title}</h3>
                <div class="match-company">${match.company || 'Unknown Company'}</div>
            </div>
        </div>

        <div class="match-meta">
            <span>📍 ${match.location || 'Unknown'}</span>
            <span>🕒 ${postedText}</span>
        </div>

        ${match.analysis?.summary ? `<div class="match-summary">${match.analysis.summary}</div>` : ''}

        ${strengthsHtml ? `<ul class="match-strengths">${strengthsHtml}</ul>` : ''}

        ${missingSkillsHtml}

        <div class="match-scores">
            <div class="score-item">
                <span>Role</span>
                <span>${Math.round(match.role_score)}%</span>
            </div>
            <div class="score-item">
                <span>Skills</span>
                <span>${Math.round(match.skill_score)}%</span>
            </div>
            <div class="score-item">
                <span>Experience</span>
                <span>${Math.round(match.experience_score)}%</span>
            </div>
            <div class="score-item">
                <span>Location</span>
                <span>${Math.round(match.location_score)}%</span>
            </div>
        </div>

        <a href="${match.url}" target="_blank" class="view-link">View Opportunity →</a>
    `;

    return card;
}

async function analyze() {
    try {
        setLoading(true);
        showStatus('Extracting jobs/posts from this page...', 'info');

        const { jobs, posts } = await extractDataOnce();

        showStatus(`Extracted ${jobs.length} jobs and ${posts.length} posts. Filtering...`, 'info');

        if (jobs.length === 0 && posts.length === 0) {
            showStatus('⚠️ No jobs or posts found on this page', 'warning');
            return;
        }

        const result = await processData(jobs, posts);
        displayResults(result);

        showStatus(`✅ Found ${result.total_matched} matches`, 'success');
    } catch (error) {
        console.error('Analysis error:', error);
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

async function selfScan() {
    // Minimal “bounded self-scan”: extract repeatedly while the page scrolls.
    // This keeps user in control (no navigation/clicking).
    try {
        setLoading(true);
        showStatus('Starting self-scan (scroll + bounded extraction)...', 'info');

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('No active tab');

        // First, ensure content script injection works; then run a few scroll cycles.
        const limits = DEFAULT_SCAN_LIMITS;
        const batches = [];

        const pagesToTry = Math.min(6, Math.max(1, limits.max_scrolls));

        for (let i = 0; i < pagesToTry; i++) {
            const { jobs, posts } = await extractDataOnce();
            if (jobs.length || posts.length) {
                batches.push({ jobs, posts });
            }

            // Scroll inside the LinkedIn tab (bounded, no navigation).
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    window.scrollBy({
                        top: Math.max(400, window.innerHeight * 0.85),
                        left: 0,
                        behavior: 'auto'
                    });
                }
            });

            await new Promise(r => setTimeout(r, limits.post_scroll_wait_ms));
        }

        let allJobs = batches.flatMap(b => b.jobs);
        let allPosts = batches.flatMap(b => b.posts);

        // Enforce bounds before heavy ML work.
        allJobs = allJobs.slice(0, limits.max_jobs);
        allPosts = allPosts.slice(0, limits.max_posts);

        showStatus(`Self-scan extracted ${allJobs.length} jobs and ${allPosts.length} posts. Filtering...`, 'info');

        if (allJobs.length === 0 && allPosts.length === 0) {
            showStatus('⚠️ Self-scan found no jobs/posts.', 'warning');
            return;
        }

        const result = await processData(allJobs, allPosts);
        displayResults(result);

        showStatus(`✅ Found ${result.total_matched} matches`, 'success');
    } catch (error) {
        console.error('Self-scan error:', error);
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

if (scanBtn) {
    scanBtn.addEventListener('click', selfScan);
}

analyzeBtn.addEventListener('click', analyze);
init();
