const spatialField = document.getElementById("spatial-field");
const spatialBall = document.getElementById("spatialBall");
const volumeSlider = document.getElementById("volume-slider");
const volumeFeedback = document.getElementById("volume-feedback");
const waveformInputs = Array.from(document.querySelectorAll(".waveformSelect"));
const waveformFeedback = document.getElementById("waveform-feedback");
const positionFeedback = document.getElementById("position-feedback");
const brightnessFeedback = document.getElementById("brightness-feedback");
const resonanceFeedback = document.getElementById("resonance-feedback");

/* I use one polyphonic synth for the keyboard so several notes can overlap. This supports simple, shared playing without adding a complex music interface. */

const keyboardSynth = new Tone.PolySynth(Tone.Synth, {
    // Add some headroom before the filter, because several notes can overlap.
    volume: -8,
    oscillator: { type: "sine" },
    envelope: {
        attack: 0.015,
        decay: 0.15,
        sustain: 0.55,
        release: 0.45
    }
});

/*
 * A pure sine wave has almost no overtones, so a resonant filter has very
 * little extra material to shape. This gentle exciter adds a small amount
 * of harmonics before the filter, making both spatial axes audible even
 * when Player 02 selects Sine. The amount stays low to avoid harshness.
 */
const harmonicExciter = new Tone.Distortion(0.12);
harmonicExciter.oversample = "2x";

/*
 * The main low-pass filter controls brightness on the horizontal axis.
 * I keep its Q close to a normal Butterworth response, because the vertical
 * axis uses a separate resonant layer below. This keeps the two controls
 * easier to hear and understand independently.
 */
const filter = new Tone.Filter(1400, "lowpass", -12);
filter.Q.value = 0.707;

/*
 * The previous low-pass Q change was too subtle to hear across the whole pad.
 * This band-pass filter creates a focused resonant layer around 550 Hz, close
 * to the C4-C5 keyboard range. Player 01 controls how much of this layer is
 * mixed into the shared sound with vertical movement.
 */
const resonanceFilter = new Tone.Filter(550, "bandpass");
resonanceFilter.Q.value = 1.4;
const resonanceGain = new Tone.Gain(0);

/* The slider controls the master level. Both sound paths are mixed before the compressor and limiter so overlapping notes and resonance peaks are controlled together. */
const masterVolume = new Tone.Volume(-8);
const compressor = new Tone.Compressor({
    threshold: -16,
    ratio: 4,
    attack: 0.005,
    release: 0.15,
    knee: 6
});
const limiter = new Tone.Limiter(-2).toDestination();

keyboardSynth.connect(harmonicExciter);

// Main sound path: horizontal movement changes low-pass brightness.
harmonicExciter.connect(filter);
filter.connect(masterVolume);

// Parallel sound path: vertical movement adds or reduces a resonant midrange band.
harmonicExciter.connect(resonanceFilter);
resonanceFilter.connect(resonanceGain);
resonanceGain.connect(masterVolume);

masterVolume.connect(compressor);
compressor.connect(limiter);

/* These values store the ball’s position as percentages from 0 to 1, which makes the sound mapping work at any screen size. */

const spatialState = { x: 0.54, y: 0.44 };
let spatialDragging = false;
let audioStartPromise = null;

/* Keep the spatial values inside the pad, so the control point and sound parameters cannot move beyond their intended range. */

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

/* Chrome can suspend the audio context when a tab is inactive. I check the real context state each time instead of remembering only whether audio started once, so the next user action can resume audio if needed. */

async function ensureAudio() {
    const context = Tone.context;

    // Do nothing when audio is already running normally.
    if (context.state === "running") {
        return;
    }

    // A closed context cannot be resumed, so the page needs to be reloaded.
    if (context.state === "closed") {
        throw new Error("The audio context is closed. Reload the page to restart audio.");
    }

    // Share one resume request when several keys are pressed at almost the same time.
    if (!audioStartPromise) {
        audioStartPromise = Tone.start()
            .then(() => {
                if (Tone.context.state !== "running") {
                    throw new Error(`Audio context did not resume. Current state: ${Tone.context.state}`);
                }
            })
            .finally(() => {
                // Clear the lock whether the resume succeeded or failed, so later input can retry.
                audioStartPromise = null;
            });
    }

    await audioStartPromise;
}

/*
 * Map left-to-right movement to filter frequency. This range is closer to
 * the C4-C5 keyboard notes and their added overtones, so moving left and
 * right changes more of the sound instead of spending most of the range
 * above the notes where the filter would have little effect.
 */
function getFilterFrequency(x) {
    const minFrequency = 220;
    const maxFrequency = 6500;
    return minFrequency * Math.pow(maxFrequency / minFrequency, x);
}

/*
 * Map up-and-down movement to the amount of the resonant band mixed into
 * the sound. The top adds more of this band and the bottom removes it.
 * A 0-0.35 gain range makes the change clearly audible without overwhelming
 * the keyboard notes.
 */
function getResonance(y) {
    return (1 - y) * 0.35;
}

/* Turn the current coordinates into simple words, so users can understand the sound state without reading technical values first. */

function describeSpatialPosition(x, y) {
    const horizontal = x < 0.34 ? "Dark" : x > 0.66 ? "Bright" : "Balanced";
    const vertical = y < 0.34 ? "Resonant" : y > 0.66 ? "Smooth" : "Balanced";
    return `${horizontal} · ${vertical}`;
}

/* This is the main link between movement and feedback: update the filter, move the ball visually, and refresh the text/values at the same time. */

function updateSpatialSound() {
    const frequency = getFilterFrequency(spatialState.x);
    const resonance = getResonance(spatialState.y);

    filter.frequency.rampTo(frequency, 0.09);
    resonanceGain.gain.rampTo(resonance, 0.09);

    spatialBall.style.left = `${spatialState.x * 100}%`;
    spatialBall.style.top = `${spatialState.y * 100}%`;
    spatialBall.setAttribute("aria-label", `Spatial control point. ${describeSpatialPosition(spatialState.x, spatialState.y)}. Use arrow keys to move.`);

    positionFeedback.textContent = describeSpatialPosition(spatialState.x, spatialState.y);
    brightnessFeedback.textContent = frequency >= 1000
        ? `${(frequency / 1000).toFixed(1)} kHz`
        : `${Math.round(frequency)} Hz`;
    resonanceFeedback.textContent = `${Math.round(resonance * 100)}%`;
}

/* Convert the pointer location into normalised coordinates inside the pad. Using 0–1 values keeps the mapping independent of the pad’s pixel size. */

function getSpatialPoint(event) {
    const rect = spatialField.getBoundingClientRect();
    return {
        x: clamp((event.clientX - rect.left) / rect.width),
        y: clamp((event.clientY - rect.top) / rect.height)
    };
}

/* Start spatial control on pointer-down. Pointer events work for mouse, pen and touch, so I do not need separate interaction code for each device. */

spatialField.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) {
        return;
    }

    event.preventDefault();
    spatialDragging = true;
    spatialBall.classList.add("isDragging");

    try {
        spatialField.setPointerCapture(event.pointerId);
    } catch (error) {
        // Pointer capture is optional if the pointer has already been released.
    }

    const point = getSpatialPoint(event);
    spatialState.x = point.x;
    spatialState.y = point.y;
    updateSpatialSound();
    ensureAudio().catch((error) => console.error("Audio could not be started.", error));
});

/* Only update while the user is dragging, so moving the pointer over the pad does not constantly change the sound by accident. */

spatialField.addEventListener("pointermove", (event) => {
    if (!spatialDragging) {
        return;
    }

    const point = getSpatialPoint(event);
    spatialState.x = point.x;
    spatialState.y = point.y;
    updateSpatialSound();
});

/* Reset the dragging state and cursor when the user releases the control or the browser cancels the pointer action. */

function finishSpatialDrag() {
    spatialDragging = false;
    spatialBall.classList.remove("isDragging");
}

spatialField.addEventListener("pointerup", finishSpatialDrag);
spatialField.addEventListener("pointercancel", finishSpatialDrag);
spatialField.addEventListener("lostpointercapture", finishSpatialDrag);

/* The arrow keys provide an alternative to dragging. This keeps the spatial technique usable for people who prefer or need keyboard input. */

spatialBall.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.08 : 0.025;
    let changed = true;

    switch (event.key) {
        case "ArrowLeft":
            spatialState.x = clamp(spatialState.x - step);
            break;
        case "ArrowRight":
            spatialState.x = clamp(spatialState.x + step);
            break;
        case "ArrowUp":
            spatialState.y = clamp(spatialState.y - step);
            break;
        case "ArrowDown":
            spatialState.y = clamp(spatialState.y + step);
            break;
        default:
            changed = false;
    }

    if (changed) {
        event.preventDefault();
        updateSpatialSound();
    }
});

/* Volume changes smoothly as the slider moves, and the decibel readout shows the current setting immediately. */

volumeSlider.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    masterVolume.volume.rampTo(value, 0.05);
    volumeFeedback.textContent = `${value} dB`;
});

/*
 * Keep waveform changes in one function so the selected oscillator shape
 * and the visible readout stay in sync. The sine setting gets a little
 * harmonic excitation because a pure sine has no overtones for the filter
 * to shape; the other waveforms already contain harmonics, so they stay dry.
 */
function setWaveform(type) {
    keyboardSynth.set({ oscillator: { type } });
    harmonicExciter.distortion = type === "sine" ? 0.12 : 0;
    waveformFeedback.textContent = type === "sawtooth"
        ? "Saw"
        : type.charAt(0).toUpperCase() + type.slice(1);
}

/* Listen to the waveform radio group; choosing any option updates the shared keyboard sound. */

waveformInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
        setWaveform(event.target.value);
    });
});

/* The intro explains the two roles before the first interaction. The info dialog can be opened again later, so users do not have to remember the instructions. */

const introDialog = document.getElementById("intro-dialog");
const introCloseButton = document.getElementById("intro-dialog-close-button");
const infoDialog = document.getElementById("info-dialog");
const infoButton = document.getElementById("info-button");
const infoCloseButton = document.getElementById("info-dialog-close-button");

introDialog.showModal();
introCloseButton.addEventListener("click", async () => {
    try {
        await ensureAudio();
        introDialog.close();
    } catch (error) {
        console.error("Audio could not be started.", error);
        introDialog.close();
    }
});

infoButton.addEventListener("click", () => {
    infoDialog.showModal();
});

infoCloseButton.addEventListener("click", () => {
    infoDialog.close();
});

/* Set the initial ball position, filter and readouts when the page loads, so the visual state matches the audio settings from the start. */

updateSpatialSound();
