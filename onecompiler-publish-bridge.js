/*
 * OneCompiler → GitHub publish bridge
 *
 * Authenticate first at:
 * https://elazzouz-dotcom.github.io/hosting-studio/
 *
 * Then call:
 * await OneCompilerGitHub.publishToGitHub({
 *   owner: 'elazzouz-dotcom',
 *   repo: 'elazzouz-dotcom.github.io',
 *   branch: 'main',
 *   message: 'Update site from OneCompiler AI',
 *   files: { 'index.html': '<!doctype html>...' }
 * });
 *
 * The Worker uses the shared browser session. Do not put an access token
 * or a client secret in OneCompiler code.
 */
(() => {
  // Stable integration contract. Change these values only as a deliberate
  // migration, together with the contract check and the user-facing guide.
  const STABLE_TARGET = Object.freeze({
    api: 'https://github-oauth-proxy.elazzouz4.workers.dev',
    owner: 'elazzouz-dotcom',
    repo: 'elazzouz-dotcom.github.io',
    branch: 'main',
  });
  const DEFAULTS = Object.freeze({
    message: 'Update site from OneCompiler AI',
  });

  const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isSafeRelativePath = (path) => typeof path === 'string'
    && path.length > 0
    && path.length <= 500
    && !path.startsWith('/')
    && !path.includes('..')
    && !path.includes('\\')
    && !/[\u0000-\u001f]/.test(path);

  function validateInput({ owner, repo, branch, message, files }) {
    if (!owner || !repo || !branch) throw new Error('owner, repo and branch are required');
    if (!isPlainObject(files) || !Object.keys(files).length) {
      throw new Error('owner, repo and at least one file are required');
    }
    for (const [path, content] of Object.entries(files)) {
      if (!isSafeRelativePath(path)) throw new Error(`File paths must be relative: ${path}`);
      if (typeof content !== 'string') throw new Error(`File content must be a string: ${path}`);
    }
    if (typeof message !== 'string' || message.trim().length > 200) {
      throw new Error('Commit message must be a string of 200 characters or less');
    }
  }

  async function publishToGitHub(options = {}) {
    for (const key of ['owner', 'repo', 'branch']) {
      if (options[key] !== undefined && options[key] !== STABLE_TARGET[key]) {
        throw new Error(`${key} is fixed for this integration: ${STABLE_TARGET[key]}`);
      }
    }
    const input = {
      owner: STABLE_TARGET.owner,
      repo: STABLE_TARGET.repo,
      branch: STABLE_TARGET.branch,
      message: options.message ?? DEFAULTS.message,
      files: options.files,
    };
    validateInput(input);
    let response;
    try {
      response = await fetch(`${STABLE_TARGET.api}/publish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error('Unable to reach the GitHub Worker. Check your connection and try again.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub session is not available. Sign in from Hosting Studio first.');
      if (response.status === 403) throw new Error('GitHub denied write access to this repository.');
      throw new Error(data.message || data.error || `Publish failed (${response.status})`);
    }
    return data;
  }

  function createPublishButton({ button, getFiles, ...options }) {
    const element = typeof button === 'string' ? document.querySelector(button) : button;
    if (!element) throw new Error('Publish button was not found');
    if (typeof getFiles !== 'function') throw new Error('getFiles must be a function');

    element.addEventListener('click', async () => {
      const original = element.textContent;
      element.disabled = true;
      element.setAttribute('aria-busy', 'true');
      element.textContent = 'Publishing to GitHub…';
      try {
        const files = await getFiles();
        const result = await publishToGitHub({ ...options, files });
        element.textContent = 'Published to GitHub ✓';
        element.dataset.publishResult = JSON.stringify(result);
        return result;
      } catch (error) {
        element.textContent = `Publish failed: ${error.message}`;
        setTimeout(() => { element.textContent = original; }, 4000);
        return null;
      } finally {
        element.disabled = false;
        element.removeAttribute('aria-busy');
      }
    });
    return element;
  }

  window.OneCompilerGitHub = Object.freeze({ publishToGitHub, createPublishButton });
})();
