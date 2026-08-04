#!/usr/bin/env python3
"""Wrap index.src.html in Steven's standard AES-GCM password gate -> index.html.

Password `wf` (internal team). Ids are deliberately NOT gate/content/payload —
those collide with deck markup. localStorage key is per-artifact.
"""
import os, re, json, base64, pathlib
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes

HERE = pathlib.Path(__file__).parent
PASSWORD = "wf"
ITERATIONS = 100_000
LS_KEY = "mc_mena_pw"

def encrypt_payload(plaintext: str, password: str = PASSWORD) -> dict:
    salt, iv = os.urandom(16), os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS)
    key = kdf.derive(password.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    return {
        "v": 1,
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "iterations": ITERATIONS,
        "ciphertext": base64.b64encode(ct).decode("ascii"),
    }

src = (HERE / "index.src.html").read_text(encoding="utf-8")

# everything between <body> and the deck's <script> tag is the protected payload
body = re.search(r"<body>(.*?)<script src=\"wf-deck\.js\"></script>", src, re.S)
if not body:
    raise SystemExit("could not locate deck body in index.src.html")
inner = body.group(1).strip()

blob = json.dumps(encrypt_payload(inner))

# Title and lang come from the source file, never hardcoded here — a stale title
# leaks the previous deck's name onto the tab of a partner-facing page.
src_all = (HERE / "index.src.html").read_text(encoding="utf-8")
m = re.search(r"<title>(.*?)</title>", src_all, re.S)
DOC_TITLE = m.group(1).strip() if m else HERE.name
m = re.search(r"<html[^>]*\blang=[\"']([^\"']+)", src_all)
DOC_LANG = m.group(1) if m else "en"

html = """<!doctype html>
<html lang="__LANG__">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>__TITLE__</title>
<link rel="stylesheet" href="wf-deck.css">
<style>
  body.locked { overflow: hidden; }
  #mcmGate {
    position: fixed; inset: 0; z-index: 200;
    display: grid; place-items: center;
    background:
      radial-gradient(120% 120% at 12% 8%, #FF1F5A 0%, #C8104C 42%, #5E0F3F 78%, #2A0B33 100%);
  }
  #mcmCard {
    width: 330px; text-align: left; color: #fff;
    font-family: 'Poppins', sans-serif;
  }
  #mcmCard h2 { margin: 0 0 4px; font-size: 21px; font-weight: 600; letter-spacing: -.01em; }
  #mcmCard p  { margin: 0 0 22px; font-size: 13px; opacity: .72; }
  #mcmForm { display: flex; gap: 8px; }
  #mcmInput {
    flex: 1; padding: 11px 14px;
    border: 1px solid rgba(255,255,255,.34); border-radius: 6px;
    background: rgba(255,255,255,.10); color: #fff;
    font: inherit; font-size: 14px; outline: none;
  }
  #mcmInput::placeholder { color: rgba(255,255,255,.5); }
  #mcmInput:focus { border-color: rgba(255,255,255,.75); background: rgba(255,255,255,.16); }
  #mcmBtn {
    padding: 11px 20px; border: 0; border-radius: 6px; cursor: pointer;
    background: #fff; color: #C8104C; font: inherit; font-size: 14px; font-weight: 500;
  }
  #mcmBtn:hover { background: #FFEAF1; }
  #mcmErr { margin-top: 12px; font-size: 12px; color: #FFD2DE; min-height: 15px; }
  #mcmLock {
    position: fixed; right: 12px; bottom: 10px; z-index: 90;
    font: 400 11px 'Poppins', sans-serif; color: rgba(255,255,255,.5);
    text-decoration: none;
  }
  #mcmLock:hover { color: rgba(255,255,255,.9); }
</style>
</head>
<body class="locked">

<div id="mcmGate">
  <div id="mcmCard">
    <h2>Co-marketing film</h2>
    <p>Proposal to Mastercard MENA · draft</p>
    <form id="mcmForm" onsubmit="return mcmSubmit(event)">
      <input id="mcmInput" type="password" placeholder="password" autocomplete="off" autofocus>
      <button id="mcmBtn" type="submit">Enter</button>
    </form>
    <div id="mcmErr"></div>
  </div>
</div>

<div id="mcmShell" hidden></div>
<a id="mcmLock" href="#" hidden
   onclick="localStorage.removeItem('__LS__');location.reload();return false;">lock device</a>

<script type="application/json" id="mcmBlob">__BLOB__</script>
<script>
const MCM_LS = '__LS__';
function mcmB64(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function mcmKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function mcmDecrypt(password) {
  const b = JSON.parse(document.getElementById('mcmBlob').textContent);
  const key = await mcmKey(password, mcmB64(b.salt), b.iterations);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: mcmB64(b.iv) }, key, mcmB64(b.ciphertext));
  return new TextDecoder().decode(plain);
}
/* The deck engine binds to #deck at load, so it can only run once the
   decrypted markup is in the DOM. Append the script after injecting. */
function mcmReveal(html) {
  const shell = document.getElementById('mcmShell');
  shell.innerHTML = html;
  shell.hidden = false;
  document.getElementById('mcmGate').style.display = 'none';
  document.getElementById('mcmLock').hidden = false;
  document.body.classList.remove('locked');
  const s = document.createElement('script');
  s.src = 'wf-deck.js';
  document.body.appendChild(s);
}
async function mcmSubmit(e) {
  e.preventDefault();
  const inp = document.getElementById('mcmInput');
  const err = document.getElementById('mcmErr');
  err.textContent = '';
  try {
    mcmReveal(await mcmDecrypt(inp.value));
    try { localStorage.setItem(MCM_LS, inp.value); } catch (_) {}
  } catch (_) {
    err.textContent = 'wrong password';
    inp.value = ''; inp.focus();
  }
  return false;
}
(async () => {
  try {
    const cached = localStorage.getItem(MCM_LS);
    if (cached) mcmReveal(await mcmDecrypt(cached));
  } catch (_) {
    try { localStorage.removeItem(MCM_LS); } catch (_) {}
  }
})();
</script>
</body>
</html>
"""
html = (html.replace("__BLOB__", blob).replace("__LS__", LS_KEY)
            .replace("__TITLE__", DOC_TITLE).replace("__LANG__", DOC_LANG))
(HERE / "index.html").write_text(html, encoding="utf-8")
print(f"gated build written: {len(html)//1024}KB, payload {len(blob)//1024}KB, password '{PASSWORD}'")

# index.src.html is the only editable copy and is kept out of git so the plaintext
# never lands in a public repo. Mirror it to Drive so it is not trapped on one Mac.
import shutil, subprocess
REMOTE = "gdrive:Claude_Backup/deck_sources/"
if shutil.which("rclone"):
    dest = f"{HERE.name}.src.html"          # slug-named so decks don't collide on Drive
    try:
        subprocess.run(["rclone", "copyto", str(HERE / "index.src.html"), REMOTE + dest],
                       check=True, capture_output=True, timeout=90)
        print(f"source backed up -> {REMOTE}{dest}")
    except Exception as e:
        print(f"WARNING: Drive backup failed ({e}). Build is fine, source is local only.")
else:
    print("WARNING: rclone not found, skipped Drive backup.")
