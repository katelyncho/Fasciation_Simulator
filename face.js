// MediaPipe face landmarker -> flower state. Loaded as <script type="module">.
// Starts automatically. Add ?debug to the URL (e.g. localhost:8000/?debug) to see the webcam preview and live values.
import { FaceLandmarker, FilesetResolver, DrawingUtils } from './vendor/mediapipe/vision_bundle.mjs';

const MODEL   = 'models/face_landmarker.task';
const WASM    = 'vendor/mediapipe/wasm';
const HOLD_MS = 300;      // a new state must be held this long before the flower switches (stops flicker)

// Thresholds (0-1 blendshape scores, tilt in degrees). Lower = triggers more easily.
const TILT_DEG = 15;            // head tilt -> state2
const EYE_WIDE = 0.36;          // eye opening ratio above this (wide-open eyes) -> state2
const SMILE = 0.4, JAW = 0.3;   // smile / open jaw -> state1

const DEBUG = new URLSearchParams(location.search).has('debug');
const video = document.getElementById('cam');
const preview = document.getElementById('cam-preview');
const pctx = preview.getContext('2d');
const readout = document.getElementById('status');
const utils = new DrawingUtils(pctx);

let landmarker, lastTime = -1, candidate = 'idle', since = 0;
let locked = false;   // true once a face trigger has changed the flower; stays until Grow is pressed
let armed = true;     // after Grow, the face must go neutral once before a new trigger counts
window.addEventListener('flower-reset', () => { locked = false; armed = false; candidate = 'idle'; });

function say(text) { readout.hidden = false; readout.textContent = text; }

async function start() {
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = delegate => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await video.play();
  } catch (err) {
    say('Camera/model error: ' + err.message); console.error(err); return;   // errors are always shown
  }
  if (DEBUG) { preview.width = video.videoWidth; preview.height = video.videoHeight; preview.hidden = false; }
  requestAnimationFrame(loop);
}

function loop() {
  if (video.currentTime !== lastTime) {          // only run on a new camera frame
    lastTime = video.currentTime;
    handle(landmarker.detectForVideo(video, performance.now()));
  }
  requestAnimationFrame(loop);
}

function handle(res) {
  if (DEBUG) pctx.drawImage(video, 0, 0, preview.width, preview.height);
  const lm = res.faceLandmarks[0];
  let want = 'idle';
  if (lm) {
    const bs = Object.fromEntries(res.faceBlendshapes[0].categories.map(c => [c.categoryName, c.score]));
    const a = lm[33], b = lm[263];                       // outer eye corners
    const tilt = Math.atan2((b.y - a.y) * video.videoHeight, (b.x - a.x) * video.videoWidth) * 180 / Math.PI;
    const smile = (bs.mouthSmileLeft + bs.mouthSmileRight) / 2, jaw = bs.jawOpen;
    // Eye opening = top-to-bottom lid distance / eye width (so it doesn't depend on distance from the camera)
    const d = (p, q) => Math.hypot((p.x - q.x) * video.videoWidth, (p.y - q.y) * video.videoHeight);
    const eye = (d(lm[159], lm[145]) / d(lm[33], lm[133]) + d(lm[386], lm[374]) / d(lm[362], lm[263])) / 2;

    // ---- mapping ----
    if (Math.abs(tilt) > TILT_DEG || eye > EYE_WIDE) want = 'state2';
    else if (smile > SMILE || jaw > JAW) want = 'state1';

    if (DEBUG) {
      utils.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: '#ffffff66', lineWidth: 0.5 });
      say(`tilt ${tilt.toFixed(0)}°  smile ${smile.toFixed(2)}  jaw ${jaw.toFixed(2)}  eye ${eye.toFixed(2)}  → ${want}`
        + (locked ? '  [locked: press Grow to reset]' : !armed ? '  [relax your face]' : ''));
    }
  } else if (DEBUG) say('no face');
  commit(want);
}

function commit(want) {
  if (locked || window.flowerIsGrowing()) return;       // first trigger wins; ignore everything until Grow
  const now = performance.now();
  if (!armed) { if (want === 'idle') armed = true; candidate = 'idle'; return; }
  if (want === 'idle') { candidate = 'idle'; return; }  // neutral face is not a trigger
  if (want !== candidate) { candidate = want; since = now; }
  else if (now - since >= HOLD_MS) { locked = true; window.setFlowerTarget(want); }
}

start();