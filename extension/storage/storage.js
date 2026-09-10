/*
 * Local storage utilities for the extension.
 *
 * Stores:
 * - profiles
 * - active profile pointer
 * - scan preferences
 *
 * All data stays in chrome.storage.local.
 */

const STORAGE_KEYS = {
    PROFILES: 'profiles',
    ACTIVE_PROFILE_ID: 'activeProfileId',
    SEARCH_CONFIG: 'searchConfig'
};

function safeNowIso() {
    try {
        return new Date().toISOString();
    } catch {
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

function storageGet(keys) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(keys, (res) => {
                const err = chrome.runtime?.lastError;
                if (err) reject(err);
                else resolve(res);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function storageSet(obj) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set(obj, () => {
                const err = chrome.runtime?.lastError;
                if (err) reject(err);
                else resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

class Storage {
    static async getProfiles() {
        const res = await storageGet([STORAGE_KEYS.PROFILES]);
        return ensureProfilesArray(res[STORAGE_KEYS.PROFILES]);
    }

    static async setProfiles(profiles) {
        await storageSet({ [STORAGE_KEYS.PROFILES]: profiles });
    }

    static async listProfiles() {
        return await Storage.getProfiles();
    }

    static async getActiveProfileId() {
        const res = await storageGet([STORAGE_KEYS.ACTIVE_PROFILE_ID]);
        return res[STORAGE_KEYS.ACTIVE_PROFILE_ID] ?? null;
    }

    static async setActiveProfileId(profileId) {
        await storageSet({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId });
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
            name: profilePayload?.name || 'Imported Profile',
            profile_data: profilePayload?.profile_data || {},
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
            name: profilePayload?.name || profiles[idx].name,
            profile_data: profilePayload?.profile_data || profiles[idx].profile_data,
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
        const res = await storageGet([STORAGE_KEYS.SEARCH_CONFIG]);
        return res[STORAGE_KEYS.SEARCH_CONFIG] || getDefaultSearchConfig();
    }

    static async setSearchConfig(config) {
        await storageSet({ [STORAGE_KEYS.SEARCH_CONFIG]: config });
    }
}

export { Storage };
