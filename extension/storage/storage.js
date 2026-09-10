"""Local storage utilities for the extension.

This version removes the FastAPI backend dependency and stores:
- profiles
- active profile pointer
- scan preferences

All data stays in chrome.storage.local.
"""

const STORAGE_KEYS = {
    PROFILES: 'profiles',
    ACTIVE_PROFILE_ID: 'activeProfileId',
    SEARCH_CONFIG: 'searchConfig'
};

function safeNowIso() {
    try {
        return new Date().toISOString();
    } catch (e) {
        return '';
    }
}

function idFromNow() {
    // Simple stable-enough local id: timestamp + random suffix.
    return Date.now() + Math.floor(Math.random() * 100000);
}

function ensureProfilesArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [];
}

function getDefaultSearchConfig() {
    return {
        freshness: '24h',
        locations: [],
        roles: []
    };
}

class Storage {
    static async getProfiles() {
        const res = await chrome.storage.local.get([STORAGE_KEYS.PROFILES]);
        return ensureProfilesArray(res[STORAGE_KEYS.PROFILES]);
    }

    static async setProfiles(profiles) {
        await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
    }

    static async listProfiles() {
        return await Storage.getProfiles();
    }

    static async getActiveProfileId() {
        const res = await chrome.storage.local.get([STORAGE_KEYS.ACTIVE_PROFILE_ID]);
        return res[STORAGE_KEYS.ACTIVE_PROFILE_ID] ?? null;
    }

    static async setActiveProfileId(profileId) {
        await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId });
    }

    static async getActiveProfile() {
        const profileId = await Storage.getActiveProfileId();
        if (!profileId) return null;

        const profiles = await Storage.getProfiles();
        return profiles.find(p => p.id === profileId) || null;
    }

    static async createProfile(profilePayload) {
        const profiles = await Storage.getProfiles();
        const now = safeNowIso();

        const newProfile = {
            id: idFromNow(),
            name: profilePayload.name,
            profile_data: profilePayload.profile_data,
            created_at: now,
            updated_at: now
        };

        profiles.push(newProfile);
        await Storage.setProfiles(profiles);
        await Storage.setActiveProfileId(newProfile.id);

        return newProfile;
    }

    static async updateProfile(profileId, profilePayload) {
        const profiles = await Storage.getProfiles();
        const idx = profiles.findIndex(p => p.id === profileId);
        if (idx === -1) {
            throw new Error('Profile not found');
        }

        const now = safeNowIso();
        profiles[idx] = {
            ...profiles[idx],
            name: profilePayload.name,
            profile_data: profilePayload.profile_data,
            updated_at: now
        };

        await Storage.setProfiles(profiles);
        await Storage.setActiveProfileId(profileId);

        return profiles[idx];
    }

    static async deleteProfile(profileId) {
        const profiles = await Storage.getProfiles();
        const filtered = profiles.filter(p => p.id !== profileId);
        await Storage.setProfiles(filtered);

        const activeId = await Storage.getActiveProfileId();
        if (activeId === profileId) {
            await Storage.setActiveProfileId(filtered.length ? filtered[0].id : null);
        }

        return { status: 'deleted' };
    }

    static async getSearchConfig() {
        const res = await chrome.storage.local.get([STORAGE_KEYS.SEARCH_CONFIG]);
        return res[STORAGE_KEYS.SEARCH_CONFIG] || getDefaultSearchConfig();
    }

    static async setSearchConfig(config) {
        await chrome.storage.local.set({ [STORAGE_KEYS.SEARCH_CONFIG]: config });
    }
}

export { Storage };
