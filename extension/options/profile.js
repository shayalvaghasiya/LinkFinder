/**
 * Profile management UI (browser-only).
 */

import { Storage } from '../storage/storage.js';

// State
const state = {
    roles: [],
    strongSkills: [],
    workingSkills: [],
    familiarSkills: [],
    locations: []
};

let currentProfileId = null;

async function init() {
    await loadProfileIntoForm();

    // Enter key handlers
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

async function loadProfileIntoForm() {
    try {
        const profile = await Storage.getActiveProfile();
        if (!profile) return;

        currentProfileId = profile.id;
        document.getElementById('profileName').value = profile.name || '';
        document.getElementById('experienceYears').value = profile.profile_data?.experience_years ?? 0;

        state.roles = profile.profile_data?.roles || [];
        state.strongSkills = profile.profile_data?.skills?.strong || [];
        state.workingSkills = profile.profile_data?.skills?.working || [];
        state.familiarSkills = profile.profile_data?.skills?.familiar || [];
        state.locations = profile.profile_data?.locations || [];

        renderTags('roles');
        renderTags('strongSkills');
        renderTags('workingSkills');
        renderTags('familiarSkills');
        renderTags('locations');

        showStatus('✅ Profile loaded', 'success');
    } catch (e) {
        console.error('Profile load failed:', e);
    }
}

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

function removeTag(field, value) {
    state[field] = state[field].filter(item => item !== value);
    renderTags(field);
}

function renderTags(field) {
    const container = document.getElementById(`${field}Tags`);
    container.innerHTML = '';

    state[field].forEach(value => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            ${value}
            <button type="button" onclick="removeTag('${field}', '${value}')">×</button>
        `;
        container.appendChild(tag);
    });
}

function showStatus(message, type = 'success') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;

    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

async function saveProfile(event) {
    event.preventDefault();

    const profilePayload = {
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
        let saved;
        if (currentProfileId) {
            saved = await Storage.updateProfile(currentProfileId, profilePayload);
        } else {
            saved = await Storage.createProfile(profilePayload);
        }

        currentProfileId = saved.id;
        showStatus('✅ Profile saved successfully!', 'success');
    } catch (e) {
        console.error('Save profile failed:', e);
        showStatus('❌ Failed to save profile', 'error');
    }
}

// Expose removeTag to inline onclick
window.removeTag = removeTag;
window.addTag = addTag;

document.getElementById('profileForm').addEventListener('submit', saveProfile);

init();
