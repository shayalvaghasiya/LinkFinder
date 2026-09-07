/**
 * Popup application logic
 */

const API_URL = 'http://localhost:8000/api/v1';

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

// Initialize
async function init() {
    // Load profile
    currentProfile = await loadProfile();

    if (!currentProfile) {
        showStatus('⚠️ No profile found. Please create one in settings.', 'warning');
        analyzeBtn.disabled = true;
        return;
    }

    showStatus(`Profile: ${currentProfile.name}`, 'success');
}

// Load profile from storage or API
async function loadProfile() {
    try {
        // Check local storage first
        const stored = await chrome.storage.local.get(['currentProfileId']);

        if (!stored.currentProfileId) {
            // Try to get first available profile from API
            const response = await fetch(`${API_URL}/profiles`);

            if (!response.ok) {
                console.error('Failed to load profiles from API');
                return null;
            }

            const profiles = await response.json();

            if (profiles.length === 0) {
                return null;
            }

            // Use first profile
            const profile = profiles[0];
            await chrome.storage.local.set({ currentProfileId: profile.id });
            return profile;
        }

        // Load profile by ID
        const response = await fetch(`${API_URL}/profiles/${stored.currentProfileId}`);

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error loading profile:', error);
        return null;
    }
}

// Show status message
function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
}

// Set loading state
function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;

    if (isLoading) {
        btnText.textContent = 'Processing...';
        btnLoader.style.display = 'inline-block';
    } else {
        btnText.textContent = 'Analyze Page';
        btnLoader.style.display = 'none';
    }
}

// Extract data from current page
async function extractData() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('linkedin.com')) {
        throw new Error('Please open a LinkedIn page');
    }

    const scanJobs = scanJobsCheckbox.checked;
    const scanPosts = scanPostsCheckbox.checked;

    let jobs = [];
    let posts = [];

    // Extract jobs
    if (scanJobs && tab.url.includes('/jobs')) {
        const jobsResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobs' });
        jobs = jobsResponse?.jobs || [];
    }

    // Extract posts
    if (scanPosts && tab.url.includes('/feed')) {
        const postsResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractPosts' });
        posts = postsResponse?.posts || [];
    }

    return { jobs, posts };
}

// Send to backend for processing
async function processData(jobs, posts) {
    const searchConfig = {
        search_types: [],
        freshness: freshnessSelect.value,
        locations: currentProfile.profile_data.locations || [],
        roles: currentProfile.profile_data.roles || []
    };

    if (scanJobsCheckbox.checked) searchConfig.search_types.push('job');
    if (scanPostsCheckbox.checked) searchConfig.search_types.push('post');

    const requestBody = {
        profile_id: currentProfile.id,
        search_config: searchConfig,
        jobs: jobs,
        posts: posts
    };

    const response = await fetch(`${API_URL}/process`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Processing failed');
    }

    return await response.json();
}

// Display results
function displayResults(result) {
    // Show stats
    resultStats.innerHTML = `
        <div>Received: ${result.total_received}</div>
        <div>Filtered: ${result.total_filtered}</div>
        <div>Matched: ${result.total_matched}</div>
        <div>Time: ${result.processing_time_seconds.toFixed(1)}s</div>
    `;

    // Clear previous matches
    matchesContainer.innerHTML = '';

    if (result.matches.length === 0) {
        matchesContainer.innerHTML = '<div class="no-results">No matches found</div>';
        resultsSection.style.display = 'block';
        return;
    }

    // Display matches
    result.matches.forEach(match => {
        const matchCard = createMatchCard(match);
        matchesContainer.appendChild(matchCard);
    });

    resultsSection.style.display = 'block';
}

// Create match card element
function createMatchCard(match) {
    const card = document.createElement('div');
    card.className = 'match-card';

    const scoreClass = match.final_score >= 80 ? 'high' : match.final_score >= 60 ? 'medium' : 'low';

    let strengthsHtml = '';
    if (match.analysis?.strengths) {
        strengthsHtml = match.analysis.strengths
            .map(s => `<li>${s}</li>`)
            .join('');
    }

    let missingSkillsHtml = '';
    if (match.analysis?.missing_skills && match.analysis.missing_skills.length > 0) {
        missingSkillsHtml = `
            <div class="missing-skills">
                <strong>Missing:</strong> ${match.analysis.missing_skills.join(', ')}
            </div>
        `;
    }

    const postedText = match.posted_at
        ? new Date(match.posted_at).toLocaleString()
        : 'Unknown';

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

// Main analyze function
async function analyze() {
    try {
        setLoading(true);
        showStatus('Extracting data from page...', 'info');

        // Extract data
        const { jobs, posts } = await extractData();

        if (jobs.length === 0 && posts.length === 0) {
            showStatus('⚠️ No jobs or posts found on this page', 'warning');
            setLoading(false);
            return;
        }

        showStatus(`Processing ${jobs.length} jobs and ${posts.length} posts...`, 'info');

        // Process
        const result = await processData(jobs, posts);

        // Display results
        displayResults(result);
        showStatus(`✅ Found ${result.total_matched} matches`, 'success');

    } catch (error) {
        console.error('Analysis error:', error);
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

// Event listeners
analyzeBtn.addEventListener('click', analyze);

// Initialize on load
init();
