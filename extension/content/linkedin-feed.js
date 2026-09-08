/**
 * LinkedIn Feed page content script
 */

console.log('[LinkFinder] Feed content script loaded');

function cleanText(v) {
    if (!v) return '';
    return String(v).replace(/\s+/g, ' ').trim();
}

function getClosestContainer(el) {
    if (!el) return null;
    return el.closest('div[data-urn], li, div, article') || el.parentElement;
}

function extractPostFromLink(linkEl) {
    try {
        const postUrl = linkEl?.href;
        if (!postUrl) return null;

        const container = getClosestContainer(linkEl);
        if (!container) return null;

        const authorElement = container.querySelector(
            '.update-components-actor__name, .feed-shared-actor__name'
        );
        const author = cleanText(authorElement?.textContent) || 'Unknown';

        // Prefer explicit description selectors; fall back to text nodes if needed.
        const contentElement = container.querySelector(
            '.feed-shared-update-v2__description, .feed-shared-text, .feed-shared-update-v2__commentary'
        );

        let content = cleanText(contentElement?.textContent);

        if (!content) {
            // Heuristic fallback: take the container’s text but trim hard.
            content = cleanText(container.textContent).slice(0, 2000);
        }

        if (!content || content.length < 20) {
            return null;
        }

        const timeElement = container.querySelector('time, .update-components-actor__sub-description');
        const postedText = cleanText(timeElement?.textContent);

        const likesElement = container.querySelector('.social-details-social-counts__reactions-count');
        const commentsElement = container.querySelector('.social-details-social-counts__comments');

        const engagement = {
            likes: likesElement ? likesElement.textContent.trim() : '0',
            comments: commentsElement ? commentsElement.textContent.trim() : '0'
        };

        return {
            source: 'linkedin',
            type: 'post',
            author,
            post_url: postUrl,
            posted_text: postedText,
            content,
            engagement,
            is_job_opportunity: null, // Classified by backend
            raw_data: {}
        };
    } catch (error) {
        console.error('[LinkFinder] Error extracting post from link:', error);
        return null;
    }
}

function extractAllPosts() {
    const maxPosts = 100;

    const postLinks = Array.from(document.querySelectorAll('a[href*="/posts/"]'));
    const postsByUrl = new Map();

    for (const linkEl of postLinks) {
        const post = extractPostFromLink(linkEl);
        if (!post) continue;

        if (!postsByUrl.has(post.post_url)) {
            postsByUrl.set(post.post_url, post);
        }

        if (postsByUrl.size >= maxPosts) break;
    }

    const posts = Array.from(postsByUrl.values());

    console.log(`[LinkFinder] Candidate post links: ${postLinks.length}`);
    console.log(`[LinkFinder] Extracted posts: ${posts.length}`);

    return posts;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractPosts') {
        const posts = extractAllPosts();
        sendResponse({ posts });
    }
});

// Auto-extraction on page load (optional)
window.addEventListener('load', () => {
    setTimeout(() => {
        const posts = extractAllPosts();
        if (posts.length > 0) {
            chrome.runtime.sendMessage({
                action: 'postsExtracted',
                count: posts.length
            });
        }
    }, 2000);
});
