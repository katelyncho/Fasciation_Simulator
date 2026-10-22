// ------------------------------

const SIZE = 128;
const SHEETS = {
  idle:   { src: 'sprites/idle.png',            frames: 8 },
  state1: { src: 'sprites/state1.png',          frames: 8 },
  state2: { src: 'sprites/state2.png',          frames: 8 },
  stem:   { src: 'sprites/stem.png',            frames: 8 },
  toState1: { src: 'sprites/idle-to-state1.png', frames: 10 },
  toState2: { src: 'sprites/idle-to-state2.png', frames: 10 },
  grow:   { src: 'sprites/grow.png',            frames: 19 },
};
const GROW_BLOOM_START = 11;
const MS = { loop: 125, trans: 80, grow: 100 };

const BG = { src: 'sprites/bg-idle.png', tileW: 480, frames: 8, scale: 3 };
const LOOPS = ['idle', 'state1', 'state2', 'stem'];

const canvas = document.getElementById('flower');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const statusEl = document.getElementById('status');
const meadow = document.getElementById('meadow');
const mctx = meadow.getContext('2d');
let bgImg = null, bgIdx = 0;

const images = {};
let state = 'idle';     // loop currently playing (or 'grow' while the grow sequence runs)
let target = 'idle';    // loop the user asked for
let loopIdx = 0;
let queue = [];         // frames waiting to play: {sheet, idx, ms, land?}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const seq = (sheet, idxs, ms) => idxs.map(idx => ({ sheet, idx, ms }));

// Path to idle (the hub), then out to the target. Transitions are played reversed when going back.
function toIdle(from) {
  if (from === 'state1') return seq('toState1', range(0, 9).reverse(), MS.trans);
  if (from === 'state2') return seq('toState2', range(0, 9).reverse(), MS.trans);
  if (from === 'stem')   return seq('grow', range(GROW_BLOOM_START, 18), MS.grow);
  return [];
}
function fromIdle(to) {
  if (to === 'state1') return seq('toState1', range(0, 9), MS.trans);
  if (to === 'state2') return seq('toState2', range(0, 9), MS.trans);
  if (to === 'stem')   return seq('grow', range(GROW_BLOOM_START, 18).reverse(), MS.grow);
  return [];
}
function buildPath(from, to) {
  const q = [...toIdle(from), ...fromIdle(to)];
  q.push({ sheet: to, idx: 0, ms: MS.loop, land: to });   // arrive on frame 0 of the new loop
  return q;
}

function draw(sheet, idx) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (sheet) ctx.drawImage(images[sheet], idx * SIZE, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
}

function tick() {
  let item;
  if (!queue.length) {
    loopIdx = (loopIdx + 1) % SHEETS[state].frames;
    // Only leave a loop when it wraps, so every cut lands on a matching frame.
    if (loopIdx === 0 && target !== state) queue = buildPath(state, target);
  }
  if (queue.length) {
    item = queue.shift();
    if (item.land) {
      state = item.land; loopIdx = 0;
      if (target !== state) queue = buildPath(state, target).slice(0, -1).concat(queue); // target changed mid-way
    }
  } else {
    item = { sheet: state, idx: loopIdx, ms: MS.loop };
  }
  draw(item.sheet, item.idx);
  setTimeout(tick, item.ms);
}

function sizeMeadow() {
  meadow.width = Math.ceil(window.innerWidth / BG.scale);
  meadow.height = SIZE;
  meadow.style.width = meadow.width * BG.scale + 'px';
  meadow.style.height = SIZE * BG.scale + 'px';
  mctx.imageSmoothingEnabled = false;
  drawMeadow();
}
function drawMeadow() {
  mctx.clearRect(0, 0, meadow.width, SIZE);
  for (let x = 0; x < meadow.width; x += BG.tileW) {
    mctx.drawImage(bgImg, bgIdx * BG.tileW, 0, BG.tileW, SIZE, x, 0, BG.tileW, SIZE);
  }
}
function startMeadow() {
  sizeMeadow();
  window.addEventListener('resize', sizeMeadow);
  setInterval(() => { bgIdx = (bgIdx + 1) % BG.frames; drawMeadow(); }, MS.loop);
}

function grow() {
  state = 'grow'; target = 'idle'; loopIdx = 0;
  queue = [{ sheet: null, idx: 0, ms: 500 },     
           ...seq('grow', range(0, 18), MS.grow),
           { sheet: 'idle', idx: 0, ms: MS.loop, land: 'idle' }];
  window.dispatchEvent(new Event('flower-reset'));   // tells face.js to unlock and re-arm
}

// Used by face.js
function setFlowerTarget(t) { if (state !== 'grow') target = t; }
function flowerIsGrowing() { return state === 'grow'; }

document.querySelector('[data-action="grow"]').addEventListener('click', grow);

Promise.all([...Object.entries(SHEETS), ['bg', { src: BG.src }]].map(([k, s]) => new Promise((res, rej) => {
  const img = new Image(); img.onload = res; img.onerror = () => rej(new Error('Missing ' + s.src));
  img.src = s.src; images[k] = img;
}))).then(() => { bgImg = images.bg; startMeadow(); tick(); }).catch(err => { statusEl.hidden = false; statusEl.textContent = err.message + ' (serve the folder over http, e.g. python3 -m http.server)'; });