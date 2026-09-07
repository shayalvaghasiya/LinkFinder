/**
 * LinkedIn Feed page content script
 */

console.log('[LinkFinder] Feed content script loaded');

// Post extraction
function extractPost(postElement) {
    try {
        // LinkedIn post selectors
        const authorElement = postElement.querySelector('.update-components-actor__name, .feed-shared-actor__name');
        const contentElement = postElement.querySelector('.feed-shared-update-v2__description, .feed-shared-text');
        const timeElement = postElement.querySelector('time, .update-components-actor__sub-description');
        const linkElement = postElement.querySelector('a[href*="/posts/"]');

        if (!contentElement) {
            return null;
        }

        const author = authorElement ? authorElement.textContent.trim() : 'Unknown';
        const content = contentElement.textContent.trim();
        const postedText = timeElement ? timeElement.textContent.trim() : '';

        // Try to get post URL
        let postUrl = '';
        if (linkElement) {
            postUrl = linkElement.href;
        } else {
            // Fallback: construct from current URL
            const postId = postElement.getAttribute('data-urn') || '';
            if (postId) {
                postUrl = `https://www.linkedin.com/posts/${postId}`;
            }
        }

        // Extract engagement metrics
        const likesElement = postElement.querySelector('.social-details-social-counts__reactions-count');
        const commentsElement = postElement.querySelector('.social-details-social-counts__comments');

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
            is_job_opportunity: null,  // Will be classified by backend
            raw_data: {}
        };
    } catch (error) {
        console.error('[LinkFinder] Error extracting post:', error);
        return null;
    }
}

function extractAllPosts() {
    const posts = [];

    // Multiple selectors for different LinkedIn layouts
    const selectors = [
        '.feed-shared-update-v2',
        '.feed-shared-update',
        'div[data-urn*="activity"]'
    ];

    for (const selector of selectors) {
        const postElements = document.querySelectorAll(selector);

        postElements.forEach(element => {
            const post = extractPost(element);
            if (post && post.content.length > 20) {  // Filter out empty/short posts
                posts.push(post);
            }
        });

        if (posts.length > 0) {
            break;  // Found posts with this selector
        }
    }

    console.log(`[LinkFinder] Extracted ${posts.length} posts`);
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
