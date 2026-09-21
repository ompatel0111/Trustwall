/**
 * api.js — Centralized API communication layer.
 *
 * All Fetch API calls go through this module.
 * It handles:
 *   - JSON request/response formatting
 *   - Automatic access token refresh when a 401 is received
 *   - Redirect to login if refresh fails
 *   - Error normalization
 */

const API_BASE = '';   // same origin as the page (Flask serves both)

let _isRefreshing = false;

/**
 * Core fetch wrapper.
 * @param {string} path - API path e.g. '/api/auth/login'
 * @param {object} options - Fetch options (method, body, etc.)
 * @param {boolean} retry - Whether this is a retry after token refresh
 */
async function _fetch(path, options = {}, retry = false) {
  const url = `${API_BASE}${path}`;

  const defaultOptions = {
    credentials: 'include',  // send httpOnly cookies with every request
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Only set application/json if there is a body, or if explicitly requested
  if (defaultOptions.body && typeof defaultOptions.body === 'object') {
    defaultOptions.body = JSON.stringify(defaultOptions.body);
  } else if (!defaultOptions.body && (defaultOptions.method === 'GET' || defaultOptions.method === 'HEAD')) {
    delete defaultOptions.headers['Content-Type'];
  }

  let response;
  try {
    response = await fetch(url, defaultOptions);
  } catch (networkError) {
    throw new Error('Cannot connect to server. Is Flask running?');
  }

  // If we get a 401 (Unauthorized) and this isn't already a retry,
  // attempt to refresh the access token and retry the original request.
  // Skip refresh logic for auth endpoints (login/signup/etc.) — a 401 there
  // just means bad credentials, not an expired session.
  const isAuthEndpoint = path.startsWith('/api/auth/');
  if (response.status === 401 && !retry && !isAuthEndpoint) {
    const refreshed = await _tryRefresh();
    if (refreshed) {
      return _fetch(path, options, true);  // retry once
    } else {
      // Refresh failed — redirect to login only if not already on an auth page
      const onAuthPage = ['/login.html', '/signup.html', '/forgot-password.html', '/reset-password.html']
        .some(p => window.location.pathname.endsWith(p));
      if (!onAuthPage) {
        window.location.href = '/login.html';
      }
      return;
    }
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = { success: response.ok, message: response.statusText || 'Response received' };
  }
  return { ok: response.ok, status: response.status, data };
}

/**
 * Attempt to refresh the access token using the refresh token cookie.
 * Returns true on success, false on failure.
 */
async function _tryRefresh() {
  if (_isRefreshing) return false;
  _isRefreshing = true;

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    _isRefreshing = false;
    return response.ok;
  } catch {
    _isRefreshing = false;
    return false;
  }
}

// ── Public API methods ────────────────────────────────────────────────────────

const api = {
  get:    (path)         => _fetch(path, { method: 'GET' }),
  post:   (path, body)   => _fetch(path, { method: 'POST', body }),
  put:    (path, body)   => _fetch(path, { method: 'PUT', body }),
  delete: (path)         => _fetch(path, { method: 'DELETE' }),
};

export default api;
