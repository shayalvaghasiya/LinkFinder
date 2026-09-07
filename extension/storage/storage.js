"""Storage utilities for Chrome extension."""
class Storage:
    """Chrome storage wrapper."""

    @staticmethod
    def get_profile():
        """Get current profile from storage."""
        return new Promise((resolve) => {
            chrome.storage.local.get(['currentProfile'], (result) => {
                resolve(result.currentProfile || null);
            });
        });

    @staticmethod
    def set_profile(profile):
        """Save profile to storage."""
        return new Promise((resolve) => {
            chrome.storage.local.set({'currentProfile': profile}, resolve);
        });

    @staticmethod
    def get_search_config():
        """Get search configuration."""
        return new Promise((resolve) => {
            chrome.storage.local.get(['searchConfig'], (result) => {
                resolve(result.searchConfig || {
                    search_types: ['job', 'post'],
                    freshness: '24h',
                    locations: [],
                    roles: []
                });
            });
        });

    @staticmethod
    def set_search_config(config):
        """Save search configuration."""
        return new Promise((resolve) => {
            chrome.storage.local.set({'searchConfig': config}, resolve);
        });

    @staticmethod
    def get_api_url():
        """Get API URL."""
        return 'http://localhost:8000/api/v1';
