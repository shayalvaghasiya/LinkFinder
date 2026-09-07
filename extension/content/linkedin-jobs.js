/**
 * LinkedIn Jobs page content script
 */

console.log('[LinkFinder] Jobs content script loaded');

// Job extraction
function extractJobCard(cardElement) {
    try {
        // LinkedIn job card selectors (these may need updates as LinkedIn changes)
        const titleElement = cardElement.querySelector('.job-card-list__title, .jobs-search-results__list-item-title');
        const companyElement = cardElement.querySelector('.job-card-container__company-name, .job-card-container__primary-description');
        const locationElement = cardElement.querySelector('.job-card-container__metadata-item, .job-card-container__metadata-wrapper');
        const linkElement = cardElement.querySelector('a[href*="/jobs/view/"]');
        const timeElement = cardElement.querySelector('time, .job-card-container__listed-time');

        if (!titleElement || !linkElement) {
            return null;
        }

        // Extract job URL
        const url = linkElement.href;

        // Extract details
        const title = titleElement.textContent.trim();
        const company = companyElement ? companyElement.textContent.trim() : '';
        const location = locationElement ? locationElement.textContent.trim() : '';
        const postedText = timeElement ? timeElement.textContent.trim() : '';

        return {
            source: 'linkedin',
            type: 'job',
            title,
            company,
            location,
            url,
            posted_text: postedText,
            description: null,  // Will be extracted if card is expanded
            skills: [],
            experience_text: null,
            employment_type: null,
            raw_data: {}
        };
    } catch (error) {
        console.error('[LinkFinder] Error extracting job card:', error);
        return null;
    }
}

function extractAllJobs() {
    const jobs = [];

    // Multiple selectors to handle different LinkedIn layouts
    const selectors = [
        '.jobs-search-results__list-item',
        '.job-card-container',
        '.job-card-list__entity-lockup'
    ];

    for (const selector of selectors) {
        const jobCards = document.querySelectorAll(selector);

        jobCards.forEach(card => {
            const job = extractJobCard(card);
            if (job) {
                jobs.push(job);
            }
        });

        if (jobs.length > 0) {
            break;  // Found jobs with this selector
        }
    }

    console.log(`[LinkFinder] Extracted ${jobs.length} jobs`);
    return jobs;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractJobs') {
        const jobs = extractAllJobs();
        sendResponse({ jobs });
    }
});

// Auto-extraction on page load (optional)
window.addEventListener('load', () => {
    setTimeout(() => {
        const jobs = extractAllJobs();
        if (jobs.length > 0) {
            chrome.runtime.sendMessage({
                action: 'jobsExtracted',
                count: jobs.length
            });
        }
    }, 2000);
});
