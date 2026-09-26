/**
 * Server-rendered pages for the authorization flow. The consent page signs the
 * user in with the same Firebase Auth providers as public/login.html, then
 * posts the Firebase ID token back to /oauth/consent.
 */

import { SCOPE_DESCRIPTIONS } from '../config.js';
import { isLoopbackRedirect } from './clientMetadata.js';

const FIREBASE_SDK_VERSION = '10.12.4'; // keep in sync with public/login.html

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** CSP for our pages: nonce-gated scripts, no framing (clickjacking defense for consent). */
export function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

const STYLES = `
  :root { --bg:#F2F0E9; --surface:#FFFCF5; --text:#282624; --muted:#8A8580; --line:#DCD6CE; --clay:#C29B8B; --sage:#9FA898; --dark:#1A1918; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         background:var(--bg); color:var(--text); font-family:Inter, system-ui, sans-serif; }
  .card { width:100%; max-width:440px; background:var(--surface); border:1px solid var(--line); border-radius:4px;
          padding:32px 28px; box-shadow:0 10px 40px -10px rgba(0,0,0,0.1); }
  .logo { display:block; height:32px; margin:0 auto 20px; }
  h1 { font-family:'Playfair Display', Georgia, serif; font-weight:500; font-size:24px; line-height:1.3; margin:0 0 8px; text-align:center; }
  p { font-size:14px; line-height:1.55; margin:0 0 12px; }
  .muted { color:var(--muted); }
  .center { text-align:center; }
  .label { font-family:'JetBrains Mono', monospace; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:20px 0 8px; }
  ul { list-style:none; padding:0; margin:0; }
  li { font-size:14px; padding:10px 0; border-top:1px dashed var(--line); }
  li:first-child { border-top:0; }
  code { font-family:'JetBrains Mono', monospace; font-size:12px; background:var(--bg); padding:1px 5px; border-radius:3px; word-break:break-all; }
  .warn { background:#FBF1E6; border:1px solid #E8D2BC; border-radius:4px; padding:10px 12px; font-size:13px; margin:12px 0; }
  .error { background:#FBECEC; border:1px solid #E7C3C3; border-radius:4px; padding:10px 12px; font-size:13px; margin:12px 0; }
  button { width:100%; font:inherit; font-size:14px; font-weight:500; padding:12px 16px; border-radius:4px; cursor:pointer; margin-top:10px;
           border:1px solid var(--line); background:#fff; color:var(--text); display:flex; align-items:center; justify-content:center; gap:10px; }
  button.primary { background:var(--dark); border-color:var(--dark); color:#fff; }
  button.facebook { background:#1877F2; border-color:#1877F2; color:#fff; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  button.link { border:0; background:none; color:var(--muted); font-size:13px; text-decoration:underline; margin-top:14px; }
  .hidden { display:none !important; }
  .who { display:flex; align-items:center; gap:10px; font-size:14px; }
  .who img { width:32px; height:32px; border-radius:50%; }
`;

function layout({ title, nonce, body, scripts = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(title)} | Scarsdale Buzz</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Playfair+Display:wght@500&family=JetBrains+Mono&display=swap">
  <style nonce="${nonce}">${STYLES}</style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/images/logos/logo_name_white_bg.png" alt="Scarsdale Buzz">
    ${body}
  </main>
  ${scripts}
</body>
</html>`;
}

export function renderErrorPage({ title, message, nonce }) {
  return layout({
    title,
    nonce,
    body: `<h1>${escapeHtml(title)}</h1><p class="center muted">${escapeHtml(message)}</p>
           <p class="center muted">You can close this window and try connecting again from your app.</p>`,
  });
}

/**
 * @param {object} args
 * @param {object} args.request - pending authorization request
 * @param {string} args.requestId
 * @param {string} args.nonce
 * @param {boolean} [args.devSignIn] - local development only: skip Firebase and sign in as a fake user
 */
export function renderConsentPage({ request, requestId, nonce, devSignIn = false }) {
  const redirect = new URL(request.redirectUri);
  const clientName = request.clientName || 'An unnamed application';
  const verifiedDomain = request.clientSource === 'metadata_document' ? new URL(request.clientId).hostname : null;
  const loopback = isLoopbackRedirect(request.redirectUri);

  const scopeItems = request.scopes
    .map((s) => `<li>${escapeHtml(SCOPE_DESCRIPTIONS[s] || s)}</li>`)
    .join('');

  const identityNote = verifiedDomain
    ? `<p class="muted center">Published by <strong>${escapeHtml(verifiedDomain)}</strong></p>`
    : `<p class="muted center">This app registered itself; its name has not been verified by Scarsdale Buzz.</p>`;

  const loopbackWarning = loopback
    ? `<div class="warn">This app will receive access on <code>${escapeHtml(redirect.host)}</code>, a program running on
       your own computer. Only continue if you started this connection yourself.</div>`
    : '';

  const body = `
    <h1><span id="client-name">${escapeHtml(clientName)}</span> wants to access your Scarsdale Buzz account</h1>
    ${identityNote}

    <div class="label">It will be able to</div>
    <ul>${scopeItems}</ul>
    <p class="muted" style="margin-top:12px">Read-only. It can't change your recommendations or profile.</p>

    <div class="label">You'll be sent back to</div>
    <p><code>${escapeHtml(redirect.origin)}</code></p>
    ${loopbackWarning}

    <div id="error" class="error hidden" role="alert"></div>

    <section id="signed-out" class="hidden">
      <div class="label">Sign in to continue</div>
      ${
        devSignIn
          ? '<button id="dev-signin" class="primary">Continue as local dev user</button>'
          : '<button id="facebook-signin" class="facebook">Continue with Facebook</button>'
      }
    </section>

    <section id="signed-in" class="hidden">
      <div class="label">Signed in as</div>
      <div class="who"><img id="user-photo" class="hidden" alt=""><span id="user-name"></span></div>
      <div id="pending" class="warn hidden">Your Scarsdale Buzz account is still waiting for approval, so it can't be
        connected yet. You'll get directory access once an admin approves your account.</div>
      <button id="approve" class="primary">Allow access</button>
      <button id="deny">Deny</button>
      <button id="switch" class="link">Use a different account</button>
    </section>

    <p id="loading" class="center muted">Loading…</p>
  `;

  const config = JSON.stringify({ requestId, devSignIn }).replace(/</g, '\\u003c');
  const firebaseScripts = devSignIn
    ? ''
    : `<script nonce="${nonce}" src="https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js"></script>
  <script nonce="${nonce}" src="https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js"></script>
  <script nonce="${nonce}" src="/firebase-config.js"></script>`;

  const scripts = `${firebaseScripts}
  <script nonce="${nonce}">${CONSENT_SCRIPT.replace('__CONFIG__', config)}</script>`;

  return layout({ title: 'Connect an app', nonce, body, scripts });
}

// Runs in the browser. Kept dependency-free apart from the Firebase compat SDK.
const CONSENT_SCRIPT = `
(function () {
  var cfg = __CONFIG__;
  var $ = function (id) { return document.getElementById(id); };
  var currentToken = null;

  function show(id, visible) { $(id).classList.toggle('hidden', !visible); }
  function setBusy(busy) {
    document.querySelectorAll('button').forEach(function (b) { b.disabled = busy; });
  }
  function showError(message) {
    $('error').textContent = message;
    show('error', !!message);
  }

  function post(decision) {
    return fetch('/oauth/consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: cfg.requestId, idToken: currentToken, decision: decision })
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error_description || 'Something went wrong. Please try again.');
        return body;
      });
    });
  }

  function onSignedIn(token, fallbackName, photo) {
    currentToken = token;
    setBusy(true);
    post('check').then(function (info) {
      $('user-name').textContent = info.name || info.email || fallbackName || 'Scarsdale Buzz member';
      if (photo) { $('user-photo').src = photo; show('user-photo', true); }
      show('pending', !info.approved);
      show('approve', info.approved);
      show('signed-out', false);
      show('signed-in', true);
    }).catch(function (err) {
      showError(err.message);
      show('signed-out', true);
    }).finally(function () {
      show('loading', false);
      setBusy(false);
    });
  }

  function decide(decision) {
    setBusy(true);
    showError('');
    post(decision).then(function (body) {
      window.location.replace(body.redirect_to);
    }).catch(function (err) {
      showError(err.message);
      setBusy(false);
    });
  }

  $('approve').addEventListener('click', function () { decide('approve'); });
  $('deny').addEventListener('click', function () { decide('deny'); });

  if (cfg.devSignIn) {
    $('dev-signin').addEventListener('click', function () { onSignedIn('dev:dev-user', 'Local Dev User'); });
    $('switch').addEventListener('click', function () { show('signed-in', false); show('signed-out', true); });
    show('loading', false);
    show('signed-out', true);
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  var auth = firebase.auth();
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  function signIn(provider) {
    showError('');
    setBusy(true);
    var action = isMobile ? auth.signInWithRedirect(provider) : auth.signInWithPopup(provider);
    action.catch(function (err) {
      setBusy(false);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      if (err.code === 'auth/account-exists-with-different-credential') {
        showError('An account already exists with this email using a different sign-in method. Please use that one.');
      } else {
        showError('Sign-in failed: ' + err.message);
      }
    });
  }

  var facebook = new firebase.auth.FacebookAuthProvider();
  facebook.addScope('email');
  facebook.addScope('public_profile');
  $('facebook-signin').addEventListener('click', function () { signIn(facebook); });  $('switch').addEventListener('click', function () { auth.signOut(); });

  auth.getRedirectResult().catch(function (err) { showError('Sign-in failed: ' + err.message); });
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      currentToken = null;
      show('loading', false);
      show('signed-in', false);
      show('signed-out', true);
      return;
    }
    user.getIdToken(true).then(function (token) {
      onSignedIn(token, user.displayName, user.photoURL);
    });
  });
})();
`;
