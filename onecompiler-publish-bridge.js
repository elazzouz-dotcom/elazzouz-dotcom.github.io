/*
 * OneCompiler → GitHub publish bridge
 *
 * Sign in first at:
 * https://elazzouz-dotcom.github.io/hosting-studio/
 *
 * Then call:
 * await OneCompilerGitHub.publishToGitHub({
 *   owner: 'elazzouz-dotcom',
 *   repo: 'elazzouz-dotcom.github.io',
 *   branch: 'main',
 *   message: 'Publish from OneCompiler',
 *   files: { 'index.html': '<!doctype html>...' }
 * });
 */
(() => {
  const API = 'https://github-oauth-proxy.elazzouz4.workers.dev';

  async function publishToGitHub({ owner, repo, branch = 'main', message = 'Publish from OneCompiler', files }) {
    if (!owner || !repo || !files || !Object.keys(files).length) {
      throw new Error('owner, repo and at least one file are required');
    }
    const response = await fetch(`${API}/publish`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ owner, repo, branch, message, files })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `Publish failed (${response.status})`);
    return data;
  }

  function createPublishButton({ button, getFiles, owner = 'elazzouz-dotcom', repo = 'elazzouz-dotcom.github.io', branch = 'main', message = 'Publish from OneCompiler' }) {
    const element = typeof button === 'string' ? document.querySelector(button) : button;
    if (!element) throw new Error('Publish button was not found');
    element.addEventListener('click', async () => {
      const original = element.textContent;
      element.disabled = true;
      element.textContent = 'Publishing to GitHub…';
      try {
        const files = await getFiles();
        await publishToGitHub({ owner, repo, branch, message, files });
        element.textContent = 'Published to GitHub ✓';
      } catch (error) {
        element.textContent = `Publish failed: ${error.message}`;
        setTimeout(() => { element.textContent = original; }, 4000);
      } finally {
        element.disabled = false;
      }
    });
    return element;
  }

  window.OneCompilerGitHub = { publishToGitHub, createPublishButton };
})();
