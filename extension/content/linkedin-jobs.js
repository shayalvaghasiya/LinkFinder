/**
 * LinkedIn Jobs page content script
 */

console.log('[LinkFinder] Jobs content script loaded');

function getClosestContainer(el) {
    if (!el) return null;
    return el.closest('li, div, article') || el.parentElement;
}

function cleanText(v) {
    if (!v) return '';
    return String(v).replace(/\s+/g, ' ').trim();
}

function extractJobFromLink(linkEl) {
    try {
        const url = linkEl?.href;
        if (!url) return null;

        const container = getClosestContainer(linkEl);
        if (!container) return null;

        // Title
        const titleElement = container.querySelector(
            '.job-card-list__title, .jobs-search-results__list-item-title'
        );
        const title = cleanText(titleElement?.textContent) || cleanText(linkEl.textContent);

        // Company
        const companyElement = container.querySelector(
            '.job-card-container__company-name, .job-card-container__primary-description'
        );
        const company = cleanText(companyElement?.textContent);

        // Location
        const locationElement = container.querySelector(
            '.job-card-container__metadata-item, .job-card-container__metadata-wrapper'
        );
        const location = cleanText(locationElement?.textContent);

        // Posted time
        const timeElement = container.querySelector('time, .job-card-container__listed-time');
        const postedText = cleanText(timeElement?.textContent);

        if (!title) {
            return null;
        }

        return {
            source: 'linkedin',
            type: 'job',
            title,
            company,
            location,
            url,
            posted_text: postedText,
            description: null, // Will be extracted if card is expanded (future)
            skills: [],
            experience_text: null,
            employment_type: null,
            raw_data: {}
        };
    } catch (error) {
        console.error('[LinkFinder] Error extracting job from link:', error);
        return null;
    }
}

function extractAllJobs() {
    const maxJobs = 100;

    // Link-first extraction: LinkedIn card subtrees change often.
    // Links tend to be stable, so we anchor extraction to them.
    const jobLinks = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));

    const jobByUrl = new Map();

    for (const linkEl of jobLinks) {
        const job = extractJobFromLink(linkEl);
        if (!job) continue;

        if (!jobByUrl.has(job.url)) {
            jobByUrl.set(job.url, job);
        }

        if (jobByUrl.size >= maxJobs) break;
    }

    const jobs = Array.from(jobByUrl.values());

    console.log(`[LinkFinder] Candidate job links: ${jobLinks.length}`);
    console.log(`[LinkFinder] Extracted jobs: ${jobs.length}`);

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
