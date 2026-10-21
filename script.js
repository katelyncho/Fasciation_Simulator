// ---- Config: every sheet is a horizontal strip of 128x128 frames ----
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
const GROW_BLOOM_START = 11;      // grow.png: frames 0-10 stem grows, 11-18 flower blooms
const MS = { loop: 125, trans: 80, grow: 100 };
const LOOPS = ['idle', 'state1', 'state2', 'stem'];

const canvas = document.getElementById('flower');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const statusEl = document.getElementById('status');
const buttons = [...document.querySelectorAll('#controls button')];

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

function setActive() {
  buttons.forEach(b => b.classList.toggle('on', b.dataset.state === target));
  statusEl.textContent = state === 'grow' ? 'growing…' : target === state ? state : `${state} → ${target}`;
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
  setActive();
  setTimeout(tick, item.ms);
}

function grow() {
  state = 'grow'; target = 'idle'; loopIdx = 0;
  queue = [{ sheet: null, idx: 0, ms: 500 },                      // empty ground
           ...seq('grow', range(0, 18), MS.grow),
           { sheet: 'idle', idx: 0, ms: MS.loop, land: 'idle' }];
}

document.getElementById('controls').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.action === 'grow') grow();
  else if (state !== 'grow') target = b.dataset.state;
  else target = b.dataset.state;       // queued; applied when the grow sequence lands on idle
  setActive();
});

// ---- Load everything, then start ----
Promise.all(Object.entries(SHEETS).map(([k, s]) => new Promise((res, rej) => {
  const img = new Image(); img.onload = res; img.onerror = () => rej(new Error('Missing ' + s.src));
  img.src = s.src; images[k] = img;
}))).then(tick).catch(err => { statusEl.textContent = err.message + ' (serve the folder over http, e.g. python3 -m http.server)'; });
