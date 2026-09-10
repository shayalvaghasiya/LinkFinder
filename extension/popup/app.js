/**
 * Popup application logic (browser-only ML pipeline).
 */

import { Storage } from '../storage/storage.js';
import { pipelineRun } from '../ml/pipeline.js';
import { DEFAULT_SCAN_LIMITS } from '../automation/scanConfig.js';
import { parseResumeFile } from '../resume/resumeParser.js';

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

// Profile editor UI
const profileDetails = document.getElementById('profileDetails');

const ui = {
    resumeFile: document.getElementById('resumeFile'),
    resumeStatus: document.getElementById('resumeStatus'),
    parseResumeBtn: document.getElementById('parseResumeBtn'),

    profileForm: document.getElementById('profileForm'),
    profileFormStatus: document.getElementById('profileFormStatus'),

    profileName: document.getElementById('profileName'),
    experienceYears: document.getElementById('experienceYears'),

    rolesInput: document.getElementById('rolesInput'),
    rolesTags: document.getElementById('rolesTags'),
    addRoleBtn: document.getElementById('addRoleBtn'),

    strongSkillInput: document.getElementById('strongSkillInput'),
    strongSkillsTags: document.getElementById('strongSkillsTags'),
    addStrongSkillBtn: document.getElementById('addStrongSkillBtn'),

    workingSkillInput: document.getElementById('workingSkillInput'),
    workingSkillsTags: document.getElementById('workingSkillsTags'),
    addWorkingSkillBtn: document.getElementById('addWorkingSkillBtn'),

    familiarSkillInput: document.getElementById('familiarSkillInput'),
    familiarSkillsTags: document.getElementById('familiarSkillsTags'),
    addFamiliarSkillBtn: document.getElementById('addFamiliarSkillBtn'),

    locationsInput: document.getElementById('locationsInput'),
    locationsTags: document.getElementById('locationsTags'),
    addLocationBtn: document.getElementById('addLocationBtn')
};

function showEl(el, visible) {
    if (!el) return;
    try {
        el.style.display = visible ? 'block' : 'none';
    } catch {
        // ignore
    }
}

function setTinyStatus(el, text, type = 'info') {
    // Keep profile panel visible while we show statuses.
    if (profileDetails) {
        profileDetails.style.display = 'block';
    }

    if (!el) return;
    el.textContent = text;
    showEl(el, !!text);

    const color =
        type === 'success' ? '#2e7d32' :
        type === 'warning' ? '#f57c00' :
        type === 'error' ? '#c62828' :
        '#666';

    try {
        el.style.color = color;
    } catch {
        // ignore
    }
}

// State
let currentProfile = null;
let currentProfileId = null;
let resumeLoadedFile = null;
let lastParsedProfilePayload = null; // not auto-saved

let tagState = {
    roles: [],
    strong: [],
    working: [],
    familiar: [],
    locations: []
};

function normalizeTagValue(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function clearProfileForm() {
    if (ui.profileName) ui.profileName.value = '';
    if (ui.experienceYears) ui.experienceYears.value = 0;

    tagState = {
        roles: [],
        strong: [],
        working: [],
        familiar: [],
        locations: []
    };

    renderAllTags();
}

function renderTagsFor(field, containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    for (const value of (tagState[field] || [])) {
        const tag = document.createElement('div');
        tag.className = 'tag';

        const label = document.createElement('span');
        label.textContent = value;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-remove';
        btn.textContent = '×';
        btn.setAttribute('aria-label', `Remove ${field} tag`);
        btn.addEventListener('click', () => {
            tagState[field] = (tagState[field] || []).filter(x => x !== value);
            renderAllTags();
        });

        tag.append(label, btn);
        containerEl.appendChild(tag);
    }
}

function renderAllTags() {
    renderTagsFor('roles', ui.rolesTags);
    renderTagsFor('strong', ui.strongSkillsTags);
    renderTagsFor('working', ui.workingSkillsTags);
    renderTagsFor('familiar', ui.familiarSkillsTags);
    renderTagsFor('locations', ui.locationsTags);
}

function addTagFromInput(field, inputEl) {
    if (!inputEl) return;

    const value = normalizeTagValue(inputEl.value);
    if (!value) return;

    if (!tagState[field]) tagState[field] = [];
    if (!tagState[field].includes(value)) {
        tagState[field].push(value);
        renderAllTags();
    }

    inputEl.value = '';
}

function applyProfilePayloadToForm(profilePayload) {
    const pd = profilePayload?.profile_data || {};

    ui.profileName.value = profilePayload?.name || '';
    ui.experienceYears.value = pd?.experience_years ?? 0;

    tagState.roles = pd?.roles || [];
    tagState.strong = pd?.skills?.strong || [];
    tagState.working = pd?.skills?.working || [];
    tagState.familiar = pd?.skills?.familiar || [];
    tagState.locations = pd?.locations || [];

    renderAllTags();
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

        const limits = DEFAULT_SCAN_LIMITS;
        const batches = [];

        const pagesToTry = Math.min(6, Math.max(1, limits.max_scrolls));

        for (let i = 0; i < pagesToTry; i++) {
            const { jobs, posts } = await extractDataOnce();
            if (jobs.length || posts.length) {
                batches.push({ jobs, posts });
            }

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

async function saveProfileFromForm(event) {
    if (event) event.preventDefault();

    if (!ui.profileForm) return;

    const profilePayload = {
        name: normalizeTagValue(ui.profileName.value) || 'Imported Profile',
        profile_data: {
            roles: tagState.roles || [],
            experience_years: parseFloat(ui.experienceYears.value) || 0,
            skills: {
                strong: tagState.strong || [],
                working: tagState.working || [],
                familiar: tagState.familiar || []
            },
            locations: tagState.locations || []
        }
    };

    ui.profileFormStatus.textContent = '';

    try {
        ui.profileFormStatus.style.display = 'block';
        setTinyStatus(ui.profileFormStatus, 'Saving profile...', 'info');

        let saved;
        if (currentProfileId) {
            saved = await Storage.updateProfile(currentProfileId, profilePayload);
        } else {
            saved = await Storage.createProfile(profilePayload);
        }

        currentProfile = saved;
        currentProfileId = saved?.id || null;

        setTinyStatus(ui.profileFormStatus, '✅ Profile saved. You can now scan/analyze.', 'success');
        showStatus(`Profile: ${currentProfile.name}`, 'success');

        if (analyzeBtn) analyzeBtn.disabled = false;
        if (scanBtn) scanBtn.disabled = false;

        // Normalize the form from what we saved.
        applyProfilePayloadToForm(saved);
    } catch (e) {
        console.error('Save profile failed:', e);
        setTinyStatus(ui.profileFormStatus, `❌ Failed to save profile: ${e.message}`, 'error');
    }
}

async function parseResumeAndPrefill() {
    if (!ui.resumeFile || !ui.parseResumeBtn) return;

    const file = ui.resumeFile.files?.[0];
    if (!file) {
        setTinyStatus(ui.resumeStatus, 'Please choose a resume file first.', 'warning');
        return;
    }

    resumeLoadedFile = file;
    lastParsedProfilePayload = null;

    setTinyStatus(ui.resumeStatus, 'Parsing resume...', 'info');
    ui.parseResumeBtn.disabled = true;

    try {
        const parsed = await parseResumeFile(file);
        lastParsedProfilePayload = parsed?.profilePayload || null;

        const warnings = parsed?.warnings || [];
        if (warnings.length) {
            setTinyStatus(ui.resumeStatus, warnings.join(' '), 'warning');
        }

        if (!parsed?.profilePayload) {
            // Keep whatever the user already typed.
            return;
        }

        applyProfilePayloadToForm(parsed.profilePayload);
        setTinyStatus(ui.profileFormStatus, '✅ Resume parsed. Review fields, then Save Profile.', 'success');
        showStatus('✅ Resume parsed. Review and save.', 'success');
    } catch (e) {
        console.error('Resume parse failed:', e);
        setTinyStatus(ui.resumeStatus, `❌ Parse failed: ${e.message}`, 'error');
    } finally {
        ui.parseResumeBtn.disabled = false;
    }
}

function bindTagInputs() {
    const bindings = [
        ['roles', ui.rolesInput, ui.addRoleBtn],
        ['strong', ui.strongSkillInput, ui.addStrongSkillBtn],
        ['working', ui.workingSkillInput, ui.addWorkingSkillBtn],
        ['familiar', ui.familiarSkillInput, ui.addFamiliarSkillBtn],
        ['locations', ui.locationsInput, ui.addLocationBtn]
    ];

    for (const [field, inputEl, addBtn] of bindings) {
        if (addBtn) {
            addBtn.addEventListener('click', () => addTagFromInput(field, inputEl));
        }

        if (inputEl) {
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addTagFromInput(field, inputEl);
                }
            });
        }
    }
}

async function init() {
    clearProfileForm();

    // If there's no stored profile, show the editor; otherwise still allow it.
    if (profileDetails) profileDetails.style.display = 'block';

    currentProfile = await Storage.getActiveProfile();
    currentProfileId = currentProfile?.id || null;

    // Default visibility: keep panel visible so users can edit directly.
    if (profileDetails) profileDetails.style.display = 'block';






    bindTagInputs();

    if (!currentProfile) {
        if (profileDetails) profileDetails.open = true;
        showStatus('⚠️ No profile found. Parse a resume or add fields, then Save Profile.', 'warning');
        analyzeBtn.disabled = true;
        if (scanBtn) scanBtn.disabled = true;
        setTinyStatus(ui.profileFormStatus, 'Create your profile to enable scanning/analyzing.', 'warning');

        // Ensure <details> content is open so user can edit immediately.
        if (profileDetails) profileDetails.open = true;
    } else {
        showStatus(`Profile: ${currentProfile.name}`, 'success');
        applyProfilePayloadToForm(currentProfile);
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (scanBtn) scanBtn.disabled = false;
        setTinyStatus(ui.profileFormStatus, 'Profile loaded. You can edit and Save.', 'info');
    }

    if (ui.parseResumeBtn) {
        ui.parseResumeBtn.addEventListener('click', parseResumeAndPrefill);
    }

    if (ui.profileForm) {
        ui.profileForm.addEventListener('submit', saveProfileFromForm);
    }
}

if (scanBtn) {
    scanBtn.addEventListener('click', selfScan);
}

analyzeBtn.addEventListener('click', analyze);
init();
