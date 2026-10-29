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
    oscillator: { type: "sine" },
    envelope: {
        attack: 0.015,
        decay: 0.15,
        sustain: 0.55,
        release: 0.45
    }
});

/* Player 01 shapes the keyboard’s sound through this shared filter. 
The keyboard remains the note source, while spatial input changes its tone instead of creating a separate instrument. */

const filter = new Tone.Filter(3500, "lowpass");
filter.Q.value = 1;

// Leave more headroom for overlapping notes.
const masterVolume = new Tone.Volume(-14);

// Catch excessive peaks before the audio reaches the output.
const limiter = new Tone.Limiter(-3).toDestination();

keyboardSynth.connect(filter);
filter.connect(masterVolume);
masterVolume.connect(limiter);

/* These values store the ball’s position as percentages from 0 to 1, which makes the sound mapping work at any screen size. */

const spatialState = { x: 0.54, y: 0.44 };
let spatialDragging = false;
let audioStarted = false;

/* Keep the spatial values inside the pad, so the control point and sound parameters cannot move beyond their intended range. */

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

/* Browsers often wait for a user gesture before starting audio. I start Tone.js only when the user interacts, then avoid restarting it each time. */

async function ensureAudio() {
    if (audioStarted) {
        return;
    }

    await Tone.start();
    audioStarted = true;
}

/* Map left-to-right movement to filter frequency. The mapping is exponential because frequency is heard more naturally across a wide range this way. */

function getFilterFrequency(x) {
    const minFrequency = 300;
    const maxFrequency = 10000;
    return minFrequency * Math.pow(maxFrequency / minFrequency, x);
}

/* Map up-and-down movement to resonance, giving the spatial pad a second sound dimension instead of making it control pitch again. */

function getResonance(y) {
    // Moving up increases resonance; moving down produces a smoother response.
    return 0.5 + (1 - y) * 6.5;
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

    filter.frequency.rampTo(frequency, 0.07);
    filter.Q.rampTo(resonance, 0.07);

    spatialBall.style.left = `${spatialState.x * 100}%`;
    spatialBall.style.top = `${spatialState.y * 100}%`;
    spatialBall.setAttribute("aria-label", `Spatial control point. ${describeSpatialPosition(spatialState.x, spatialState.y)}. Use arrow keys to move.`);

    positionFeedback.textContent = describeSpatialPosition(spatialState.x, spatialState.y);
    brightnessFeedback.textContent = frequency >= 1000
        ? `${(frequency / 1000).toFixed(1)} kHz`
        : `${Math.round(frequency)} Hz`;
    resonanceFeedback.textContent = resonance.toFixed(1);
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

/* Keep waveform changes in one function so the selected oscillator shape and the visible readout always stay in sync. */

function setWaveform(type) {
    keyboardSynth.set({ oscillator: { type } });
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