/**
 * Profile management UI
 */

const API_URL = 'http://localhost:8000/api/v1';

// State
const state = {
    roles: [],
    strongSkills: [],
    workingSkills: [],
    familiarSkills: [],
    locations: []
};

let currentProfileId = null;

// Initialize
async function init() {
    await loadProfile();

    // Add Enter key handlers
    ['roles', 'strongSkills', 'workingSkills', 'familiarSkills', 'locations'].forEach(field => {
        const input = document.getElementById(`${field}Input`);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTag(field);
            }
        });
    });
}

// Load profile
async function loadProfile() {
    try {
        const stored = await chrome.storage.local.get(['currentProfileId']);

        if (!stored.currentProfileId) {
            // Try to get first profile
            const response = await fetch(`${API_URL}/profiles`);
            if (response.ok) {
                const profiles = await response.json();
                if (profiles.length > 0) {
                    populateForm(profiles[0]);
                    currentProfileId = profiles[0].id;
                    return;
                }
            }
            return;
        }

        // Load specific profile
        const response = await fetch(`${API_URL}/profiles/${stored.currentProfileId}`);
        if (response.ok) {
            const profile = await response.json();
            populateForm(profile);
            currentProfileId = profile.id;
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Populate form with profile data
function populateForm(profile) {
    document.getElementById('profileName').value = profile.name;
    document.getElementById('experienceYears').value = profile.profile_data.experience_years || 0;

    state.roles = profile.profile_data.roles || [];
    state.strongSkills = profile.profile_data.skills?.strong || [];
    state.workingSkills = profile.profile_data.skills?.working || [];
    state.familiarSkills = profile.profile_data.skills?.familiar || [];
    state.locations = profile.profile_data.locations || [];

    renderTags('roles');
    renderTags('strongSkills');
    renderTags('workingSkills');
    renderTags('familiarSkills');
    renderTags('locations');
}

// Add tag
function addTag(field) {
    const input = document.getElementById(`${field}Input`);
    const value = input.value.trim();

    if (!value) return;

    if (!state[field].includes(value)) {
        state[field].push(value);
        renderTags(field);
    }

    input.value = '';
}

// Remove tag
function removeTag(field, value) {
    state[field] = state[field].filter(item => item !== value);
    renderTags(field);
}

// Render tags
function renderTags(field) {
    const container = document.getElementById(`${field}Tags`);
    container.innerHTML = '';

    state[field].forEach(value => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            ${value}
            <button onclick="removeTag('${field}', '${value}')">×</button>
        `;
        container.appendChild(tag);
    });
}

// Show status
function showStatus(message, type = 'success') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;

    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

// Save profile
async function saveProfile(event) {
    event.preventDefault();

    const profileData = {
        name: document.getElementById('profileName').value,
        profile_data: {
            roles: state.roles,
            experience_years: parseFloat(document.getElementById('experienceYears').value) || 0,
            skills: {
                strong: state.strongSkills,
                working: state.workingSkills,
                familiar: state.familiarSkills
            },
            locations: state.locations,
            education: [],
            certifications: [],
            preferences: {}
        }
    };

    try {
        let response;

        if (currentProfileId) {
            // Update existing profile
            response = await fetch(`${API_URL}/profiles/${currentProfileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });
        } else {
            // Create new profile
            response = await fetch(`${API_URL}/profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });
        }

        if (!response.ok) {
            throw new Error('Failed to save profile');
        }

        const savedProfile = await response.json();
        currentProfileId = savedProfile.id;

        // Save profile ID to storage
        await chrome.storage.local.set({ currentProfileId: savedProfile.id });

        showStatus('✅ Profile saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving profile:', error);
        showStatus('❌ Failed to save profile', 'error');
    }
}

// Event listeners
document.getElementById('profileForm').addEventListener('submit', saveProfile);

// Initialize
init();
