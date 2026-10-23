// The fortune cat. Uses your own images from app/cat/tier-1.png … tier-5.png
// when they exist; until then, draws a placeholder cat in SVG.

const MATERIALS = {
  1: { body: '#cfc6b8', shade: '#b0a696', line: '#6e655a', accent: '#b89a93', coin: null, gloss: 0, inner: '#c4a9a2' },
  2: { body: '#ebe5da', shade: '#cfc6b6', line: '#6e655a', accent: '#c4776b', coin: ['#c08a5c', '#8f5f37'], gloss: 0.15, inner: '#e3b6ae' },
  3: { body: '#ffffff', shade: '#e6e1da', line: '#5b4f45', accent: '#d42f2f', coin: ['#f1cd62', '#c99a25'], gloss: 0.5, inner: '#f6b9b9' },
  4: { body: '#fffdf8', shade: '#e9e1d2', line: '#4b4038', accent: '#c8102e', coin: ['#ffe07a', '#c8901a'], gloss: 0.8, inner: '#f5a9b4', goldTrim: true },
  5: { body: 'url(#gold5)', shade: '#a87a12', line: '#6b4a06', accent: 'rgba(196,16,46,0.82)', coin: ['#fff3b0', '#d6a01c'], gloss: 0.9, inner: '#f3c75a', goldTrim: true },
};

const imageCache = {};

/** Resolves to an image URL for the tier, or null if there's no custom image. */
function customImage(tier) {
  if (tier in imageCache) return imageCache[tier];
  imageCache[tier] = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.src);
    img.onerror = () => resolve(null);
    img.src = `cat/tier-${tier}.png`;
  });
  return imageCache[tier];
}

let currentTier = null;

/** Shows the cat for a tier inside `stage`, cross-fading from the previous one. */
export async function renderCat(stage, tier) {
  if (tier === currentTier && stage.querySelector('.cat-layer')) return;
  // A freshly drawn screen shows the cat at once; only a tier change cross-fades.
  const firstRender = !stage.querySelector('.cat-layer') && (currentTier === null || currentTier === tier);
  currentTier = tier;
  const src = await customImage(tier);
  const layer = document.createElement('div');
  layer.className = 'cat-layer';
  layer.innerHTML = src
    ? `<img class="cat-img" src="${src}" alt="">`
    : catSvg(tier);
  stage.dataset.tier = tier;
  const old = [...stage.querySelectorAll('.cat-layer')];
  stage.appendChild(layer);
  if (firstRender) layer.classList.add('in');
  else requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
  old.forEach(o => { o.classList.add('out'); setTimeout(() => o.remove(), 900); });
}

/** Coins tumble into the stage (shown once a day after an under-budget day). */
export function dropCoins(stage, count = 6) {
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('span');
    coin.className = 'coin-drop';
    coin.textContent = '🪙';
    coin.style.left = (20 + Math.random() * 60) + '%';
    coin.style.animationDelay = (i * 0.18) + 's';
    stage.appendChild(coin);
    setTimeout(() => coin.remove(), 2600 + i * 180);
  }
}

// ---------- Placeholder SVG ----------

function catSvg(tier) {
  const m = MATERIALS[tier];
  const t = tier;
  return `
<svg class="cat-svg" viewBox="0 0 240 290" role="img" aria-label="Fortune cat, ${['broke', 'struggling', 'getting by', 'comfortable', 'wealthy'][t - 1]}">
  <defs>
    <linearGradient id="gold5" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff2a8"/><stop offset="0.35" stop-color="#f2c94c"/>
      <stop offset="0.7" stop-color="#c99417"/><stop offset="1" stop-color="#8a5f08"/>
    </linearGradient>
    <radialGradient id="gloss${t}" cx="0.35" cy="0.3" r="0.6">
      <stop offset="0" stop-color="#fff" stop-opacity="${m.gloss}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    ${m.coin ? `<linearGradient id="coin${t}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.coin[0]}"/><stop offset="1" stop-color="${m.coin[1]}"/></linearGradient>` : ''}
  </defs>
  ${base(t)}
  <g class="cat-body" stroke="${m.line}" stroke-width="2.5" stroke-linejoin="round">
    <ellipse cx="120" cy="190" rx="72" ry="58" fill="${m.body}"/>
    <ellipse cx="120" cy="208" rx="60" ry="34" fill="${m.shade}" stroke="none" opacity="0.35"/>
    <path d="M64 72 L72 22 L106 52 Z" fill="${m.body}"/>
    <path d="M176 72 L168 22 L134 52 Z" fill="${m.body}"/>
    <path d="M74 60 L77 34 L96 52 Z" fill="${m.inner}" stroke="none"/>
    <path d="M166 60 L163 34 L144 52 Z" fill="${m.inner}" stroke="none"/>
    <ellipse cx="120" cy="100" rx="68" ry="56" fill="${m.body}"/>
    <ellipse cx="120" cy="100" rx="68" ry="56" fill="url(#gloss${t})" stroke="none"/>
    ${face(t, m)}
    <path d="M62 146 Q120 172 178 146 L176 158 Q120 184 64 158 Z" fill="${m.accent}"/>
    <circle cx="120" cy="172" r="11" fill="${m.coin ? `url(#coin${t})` : '#a39a82'}"/>
    <path d="M113 172 h14" stroke-width="2"/>
    ${m.goldTrim ? '<path d="M64 158 Q120 184 176 158" fill="none" stroke="#e2b23a" stroke-width="2"/>' : ''}
    <g class="cat-paw-wave">
      <path d="M166 150 Q176 110 184 92 Q198 84 204 98 Q200 124 190 156 Z" fill="${m.body}"/>
      <path d="M186 96 q4 -5 9 0 M190 102 q4 -4 8 0" fill="none" stroke-width="1.6"/>
      <ellipse cx="193" cy="104" rx="5" ry="3.5" fill="${m.inner}" stroke="none"/>
    </g>
    ${heldItem(t, m)}
    <ellipse cx="120" cy="190" rx="72" ry="58" fill="url(#gloss${t})" stroke="none"/>
  </g>
  ${damage(t)}
  ${t === 5 ? '<g class="cat-shine"><path d="M48 70 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill="#fff8d0"/><path d="M196 186 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z" fill="#fff8d0"/></g>' : ''}
</svg>`;
}

function face(t, m) {
  const ink = m.line;
  const eyes = {
    1: `<path d="M86 100 q10 6 20 0 M134 100 q10 6 20 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
        <path d="M84 90 l16 4 M156 90 l-16 4" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M150 108 q2 8 0 12" stroke="#7fb0d8" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    2: `<path d="M86 98 h20 M134 98 h20" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    3: `<path d="M86 100 q10 -10 20 0 M134 100 q10 -10 20 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    4: `<path d="M84 100 q11 -13 22 0 M134 100 q11 -13 22 0" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`,
    5: `<path d="M96 88 l3 7 l7 1 l-5 5 l1 7 l-6 -4 l-6 4 l1 -7 l-5 -5 l7 -1 Z M144 88 l3 7 l7 1 l-5 5 l1 7 l-6 -4 l-6 4 l1 -7 l-5 -5 l7 -1 Z" fill="#c4102e" stroke="#7a0a1c" stroke-width="1"/>`,
  }[t];
  const mouth = t === 1
    ? `<path d="M110 126 q10 -7 20 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`
    : t === 2
      ? `<path d="M110 124 h20" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<path d="M108 120 q6 8 12 0 q6 8 12 0" fill="${t >= 4 ? '#e8606f' : 'none'}" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
  const blush = t >= 3 ? `<ellipse cx="82" cy="116" rx="9" ry="5" fill="#f4a3a8" opacity="0.6" stroke="none"/><ellipse cx="158" cy="116" rx="9" ry="5" fill="#f4a3a8" opacity="0.6" stroke="none"/>` : '';
  return `${eyes}
    <ellipse cx="120" cy="112" rx="5" ry="3.5" fill="#e88a95" stroke="none"/>
    ${mouth}${blush}
    <path d="M62 108 l-22 -4 M62 116 l-22 2 M178 108 l22 -4 M178 116 l22 2" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`;
}

function heldItem(t, m) {
  if (!m.coin) {
    // Crinkled grocery receipt instead of a coin.
    return `<g transform="rotate(-8 92 196)">
      <path d="M72 160 L112 160 L113 226 L106 220 L99 227 L92 220 L85 227 L78 220 L71 226 Z" fill="#f4f1e8" stroke="#8a8170" stroke-width="1.6"/>
      <path d="M78 172 h28 M78 180 h22 M78 188 h26 M78 196 h18 M78 206 h28" stroke="#9c9480" stroke-width="1.6"/>
      <path d="M74 166 l8 6 l-6 8" fill="none" stroke="#d9d3c4" stroke-width="1.4"/>
    </g>
    <ellipse cx="92" cy="214" rx="16" ry="12" fill="${m.body}"/>`;
  }
  const size = t === 5 ? 1.18 : t === 2 ? 0.86 : 1;
  return `<g transform="translate(90 196) scale(${size}) translate(-90 -196)">
      <ellipse cx="90" cy="194" rx="25" ry="34" fill="url(#coin${t})"/>
      <ellipse cx="90" cy="194" rx="18" ry="27" fill="none" stroke-width="1.6" opacity="0.6"/>
      <path d="M84 178 h12 M84 194 h12 M84 210 h12 M90 172 v44" stroke-width="1.6" opacity="0.55"/>
    </g>
    <ellipse cx="92" cy="220" rx="16" ry="12" fill="${m.body}"/>`;
}

function damage(t) {
  if (t === 1) {
    return `<g class="cat-damage">
      <rect x="66" y="40" width="34" height="10" rx="2" fill="#a9adb3" transform="rotate(-38 83 45)" opacity="0.92"/>
      <rect x="176" y="112" width="30" height="9" rx="2" fill="#2d2d2d" transform="rotate(62 191 116)" opacity="0.9"/>
      <rect x="181" y="122" width="26" height="9" rx="2" fill="#a9adb3" transform="rotate(28 194 126)" opacity="0.9"/>
      <path d="M150 168 q6 -4 10 2 q-2 6 -9 4 Z M70 140 q5 -3 8 2 q-3 5 -8 2 Z M132 66 q5 -2 7 3 q-4 4 -7 1 Z M160 206 q6 -3 9 3 q-4 5 -9 1 Z" fill="#9b9182"/>
      <path d="M118 236 l6 8 l-4 6 l7 9" fill="none" stroke="#6e655a" stroke-width="1.4"/>
    </g>`;
  }
  if (t === 2) {
    return `<g class="cat-damage">
      <rect x="148" y="40" width="28" height="9" rx="2" fill="#bcc0c5" transform="rotate(40 162 44)" opacity="0.9"/>
      <path d="M150 170 q5 -3 8 2 q-3 5 -8 1 Z M76 74 q4 -2 6 2 q-3 4 -6 1 Z" fill="#c2b8a6"/>
    </g>`;
  }
  return '';
}

function base(t) {
  switch (t) {
    case 1: return `<path d="M30 252 L210 246 L222 270 L22 276 Z" fill="#b98f5e" stroke="#7d5f3b" stroke-width="2"/>
      <path d="M60 258 L180 254" stroke="#8f6c44" stroke-width="1.5" stroke-dasharray="6 5"/>`;
    case 2: return `<ellipse cx="120" cy="252" rx="92" ry="17" fill="#c8a27a" stroke="#8d6c4a" stroke-width="2"/>
      <ellipse cx="120" cy="250" rx="78" ry="12" fill="none" stroke="#b08a63" stroke-width="1.2" stroke-dasharray="2 4"/>`;
    case 3: return `<path d="M36 244 h168 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-168 a8 8 0 0 1 -8 -8 v-14 a8 8 0 0 1 8 -8 Z" fill="#d9b48a" stroke="#9a7650" stroke-width="2"/>
      <path d="M44 256 q40 -4 80 0 t80 0" fill="none" stroke="#c49c70" stroke-width="1.4"/>`;
    case 4: return `<path d="M30 242 h180 l8 30 h-196 Z" fill="#1d1a1a" stroke="#000" stroke-width="2"/>
      <path d="M30 242 h180" stroke="#d9a520" stroke-width="3"/><path d="M40 252 h120" stroke="#fff" stroke-width="2" opacity="0.25"/>`;
    default: return `<path d="M26 238 Q120 226 214 238 L222 276 Q120 288 18 276 Z" fill="#8f1027" stroke="#5a0717" stroke-width="2"/>
      <path d="M26 238 Q120 226 214 238" fill="none" stroke="#f2c94c" stroke-width="4"/>
      <path d="M18 276 Q120 288 222 276" fill="none" stroke="#f2c94c" stroke-width="3"/>
      <path d="M44 246 Q120 238 196 246" fill="none" stroke="#c22a45" stroke-width="2" opacity="0.6"/>`;
  }
}
