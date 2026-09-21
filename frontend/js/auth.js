/**
 * auth.js — Authentication form handlers.
 *
 * Handles: signup (with email verification), login (with email verification check),
 * forgot-password, reset-password, and resend-verification.
 */

import api from './api.js';
import { toast, setLoading, clearLoading, redirectIfAuthed } from './utils.js';

// ── Reset signup page on load and on back/forward cache restore ───────────────
function resetSignupPage() {
  const formWrap    = document.getElementById('form-signup-wrap');
  const verifyState = document.getElementById('signup-verify-state');
  if (formWrap)    formWrap.style.display = '';
  if (verifyState) verifyState.classList.add('hidden');
}
resetSignupPage();

window.addEventListener('pageshow', (e) => {
  if (e.persisted) resetSignupPage();
});

// Redirect away if already logged in
redirectIfAuthed('/dashboard.html');

let lastEmail = '';

// ── Helper: show inline form error ───────────────────────────────────────────
function showAlert(container, message, type = 'error') {
  const alertEl = container.querySelector('.auth-alert');
  if (alertEl) {
    alertEl.className = `auth-alert auth-alert-${type}`;
    alertEl.textContent = message;
    alertEl.classList.remove('hidden');
  }
}

function hideAlert(container) {
  const alertEl = container.querySelector('.auth-alert');
  if (alertEl) alertEl.classList.add('hidden');
}

// ── Password visibility toggle ────────────────────────────────────────────────
document.querySelectorAll('.input-password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.input-password-wrap').querySelector('input');
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    btn.innerHTML = isVisible
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    btn.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
  });
});

// ── Show check-your-email state (only after successful signup) ────────────────
function showVerifyState(email) {
  const formWrap    = document.getElementById('form-signup-wrap');
  const verifyState = document.getElementById('signup-verify-state');

  if (!verifyState) return;

  // Hide the signup form section entirely
  if (formWrap) formWrap.style.display = 'none';
  verifyState.classList.remove('hidden');

  // Display user's email address
  document.querySelectorAll('.verify-email-display').forEach(el => {
    el.textContent = email;
  });
}

// ── Resend verification helper ────────────────────────────────────────────────
async function resendVerification(email) {
  if (!email) { toast('Please enter your email address.', 'error'); return; }
  const res = await api.post('/api/auth/resend-verification', { email });
  if (res?.ok) {
    toast('Verification email resent! Please check your inbox.', 'success');
  } else {
    toast(res?.data?.message || 'Could not resend email.', 'error');
  }
}

// ── Wire up resend button on signup page ──────────────────────────────────────
document.getElementById('btn-resend-verify')?.addEventListener('click', () => {
  resendVerification(lastEmail);
});

// ── Signup form ───────────────────────────────────────────────────────────────
const signupForm = document.getElementById('form-signup');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = signupForm.querySelector('button[type=submit]');
    hideAlert(signupForm);
    setLoading(btn);

    const name     = signupForm.name.value.trim();
    const email    = signupForm.email.value.trim();
    const password = signupForm.password.value;

    if (!name)               { clearLoading(btn); showAlert(signupForm, 'Please enter your name.'); return; }
    if (!email)              { clearLoading(btn); showAlert(signupForm, 'Please enter your email.'); return; }
    if (password.length < 8) { clearLoading(btn); showAlert(signupForm, 'Password must be at least 8 characters.'); return; }

    const result = await api.post('/api/auth/signup', { name, email, password });
    clearLoading(btn);

    if (!result) return;
    if (!result.ok) {
      showAlert(signupForm, result.data?.message || 'Signup failed. Please try again.');
      return;
    }

    lastEmail = email;
    showVerifyState(email);
  });
}

// ── Login form ────────────────────────────────────────────────────────────────
const loginForm = document.getElementById('form-login');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type=submit]');
    hideAlert(loginForm);

    const verifyPanel = document.getElementById('verify-blocked');
    if (verifyPanel) verifyPanel.style.display = 'none';

    setLoading(btn);

    const email    = loginForm.email.value.trim();
    const password = loginForm.password.value;
    lastEmail = email;

    let result;
    try {
      result = await api.post('/api/auth/login', { email, password });
    } catch {
      clearLoading(btn);
      showAlert(loginForm, 'Cannot connect to server. Make sure the backend is running.');
      return;
    }
    clearLoading(btn);

    if (!result) {
      showAlert(loginForm, 'Login failed. Please check your credentials and try again.');
      return;
    }

    // 403 = email not verified — show simple message + resend button in login panel
    if (result.status === 403 && result.data?.email_verified === false) {
      if (verifyPanel) verifyPanel.style.display = 'block';
      return;
    }

    if (!result.ok) {
      showAlert(loginForm, result.data?.message || 'Invalid email or password.');
      return;
    }

    // Success — redirect to dashboard
    window.location.replace('/dashboard.html');
  });

  // Resend button on login page
  document.getElementById('btn-resend-from-login')?.addEventListener('click', () => {
    const email = lastEmail || loginForm.email?.value?.trim();
    resendVerification(email);
  });
}

// ── Forgot password form ──────────────────────────────────────────────────────
const forgotForm = document.getElementById('form-forgot');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = forgotForm.querySelector('button[type=submit]');
    hideAlert(forgotForm);
    setLoading(btn);

    const email = forgotForm.email.value.trim();
    const result = await api.post('/api/auth/forgot-password', { email });
    clearLoading(btn);

    if (!result) return;
    showAlert(forgotForm, result.data?.message || 'Check your email for instructions.', 'success');
  });
}

// ── Reset password form ───────────────────────────────────────────────────────
const resetForm = document.getElementById('form-reset');
if (resetForm) {
  const params     = new URLSearchParams(window.location.search);
  const tokenParam = params.get('token');
  const tokenInput = resetForm.querySelector('[name=token]');
  if (tokenInput && tokenParam) tokenInput.value = tokenParam;

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = resetForm.querySelector('button[type=submit]');
    hideAlert(resetForm);

    const token    = resetForm.token?.value?.trim();
    const password = resetForm.password.value;
    const confirm  = resetForm.confirm?.value;

    if (!token)                         { showAlert(resetForm, 'Reset token is required.'); return; }
    if (password.length < 8)            { showAlert(resetForm, 'Password must be at least 8 characters.'); return; }
    if (confirm && password !== confirm) { showAlert(resetForm, 'Passwords do not match.'); return; }

    setLoading(btn);
    const result = await api.post('/api/auth/reset-password', { token, password });
    clearLoading(btn);

    if (!result) return;
    if (!result.ok) {
      showAlert(resetForm, result.data?.message || 'Reset failed. Please try again.');
      return;
    }

    showAlert(resetForm, 'Password reset! Redirecting to login…', 'success');
    setTimeout(() => window.location.href = '/login.html', 2000);
  });
}
