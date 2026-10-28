/*
 * Cooperative Synthesizer — Shared Sound Space
 * Player 02 selects notes; Player 01 shapes the same sound using spatial input.
 */

const spatialField = document.getElementById("spatial-field");
const spatialBall = document.getElementById("spatialBall");
const volumeSlider = document.getElementById("volume-slider");
const volumeFeedback = document.getElementById("volume-feedback");
const waveformInputs = Array.from(document.querySelectorAll(".waveformSelect"));
const waveformFeedback = document.getElementById("waveform-feedback");
const positionFeedback = document.getElementById("position-feedback");
const brightnessFeedback = document.getElementById("brightness-feedback");
const resonanceFeedback = document.getElementById("resonance-feedback");

const keyboardSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: {
        attack: 0.015,
        decay: 0.15,
        sustain: 0.55,
        release: 0.45
    }
});

// Spatial input modifies the same keyboard signal instead of producing a separate voice.
const filter = new Tone.Filter(3500, "lowpass");
filter.Q.value = 1;
const masterVolume = new Tone.Volume(-8).toDestination();
keyboardSynth.connect(filter);
filter.connect(masterVolume);

const spatialState = { x: 0.54, y: 0.44 };
let spatialDragging = false;
let audioStarted = false;

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

async function ensureAudio() {
    if (audioStarted) {
        return;
    }

    await Tone.start();
    audioStarted = true;
}

function getFilterFrequency(x) {
    const minFrequency = 300;
    const maxFrequency = 10000;
    return minFrequency * Math.pow(maxFrequency / minFrequency, x);
}

function getResonance(y) {
    // Moving up increases resonance; moving down produces a smoother response.
    return 0.5 + (1 - y) * 6.5;
}

function describeSpatialPosition(x, y) {
    const horizontal = x < 0.34 ? "Dark" : x > 0.66 ? "Bright" : "Balanced";
    const vertical = y < 0.34 ? "Resonant" : y > 0.66 ? "Smooth" : "Balanced";
    return `${horizontal} · ${vertical}`;
}

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

function getSpatialPoint(event) {
    const rect = spatialField.getBoundingClientRect();
    return {
        x: clamp((event.clientX - rect.left) / rect.width),
        y: clamp((event.clientY - rect.top) / rect.height)
    };
}

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

spatialField.addEventListener("pointermove", (event) => {
    if (!spatialDragging) {
        return;
    }

    const point = getSpatialPoint(event);
    spatialState.x = point.x;
    spatialState.y = point.y;
    updateSpatialSound();
});

function finishSpatialDrag() {
    spatialDragging = false;
    spatialBall.classList.remove("isDragging");
}

spatialField.addEventListener("pointerup", finishSpatialDrag);
spatialField.addEventListener("pointercancel", finishSpatialDrag);
spatialField.addEventListener("lostpointercapture", finishSpatialDrag);

// Arrow keys provide keyboard access to the existing two-dimensional control.
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

volumeSlider.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    masterVolume.volume.rampTo(value, 0.05);
    volumeFeedback.textContent = `${value} dB`;
});

function setWaveform(type) {
    keyboardSynth.set({ oscillator: { type } });
    waveformFeedback.textContent = type === "sawtooth"
        ? "Saw"
        : type.charAt(0).toUpperCase() + type.slice(1);
}

waveformInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
        setWaveform(event.target.value);
    });
});

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

updateSpatialSound();