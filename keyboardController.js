/*
 * Keyboard controller
 * White keys: A S D F G H J K
 * Black keys: W E T Y U
 * Computer keys and on-screen piano keys use the same note mapping.
 */

/* Read the piano keys from the HTML. The data attributes keep the note mapping easy to change without rewriting this controller. */
const pianoKeys = Array.from(document.querySelectorAll(".whiteKey, .blackKey"));
const computerKeyMap = new Map(
    pianoKeys.map((key) => [key.dataset.pcKey, {
        note: key.dataset.note,
        element: key
    }])
);

/* Track each physical input separately. This lets the code cancel a pending note if the user releases the key before audio has finished resuming. */
const activeComputerKeys = new Map();
const activePointerKeys = new Map();
const heldSources = new Map();
const activeNoteOwners = new Map();

/* Register the press before waiting for audio. The entry object also acts as a small ID, so an old async action cannot start a newer or already-released press. */
function registerHeldSource(sourceId, mappedKey) {
    const source = {
        note: mappedKey.note,
        element: mappedKey.element,
        playing: false
    };

    heldSources.set(sourceId, source);
    return source;
}

/* Start a note only if that exact input is still held after audio resumes. This prevents a delayed triggerAttack from firing after its key-up event. */
async function playNote(sourceId, source) {
    await ensureAudio();

    if (heldSources.get(sourceId) !== source) {
        return;
    }

    let owners = activeNoteOwners.get(source.note);

    /* Only trigger the note on the first input source; another source can hold the same note without cutting it off. */
    if (!owners) {
        keyboardSynth.triggerAttack(source.note);
        owners = new Set();
        activeNoteOwners.set(source.note, owners);
    }

    owners.add(sourceId);
    source.playing = true;
    source.element.classList.add("activeKey");
}

/* Release one input source. If another source is still holding the same note, keep that note sounding until the last source is released. */
function releaseSource(sourceId) {
    const source = heldSources.get(sourceId);
    if (!source) {
        return;
    }

    heldSources.delete(sourceId);

    if (source.playing) {
        const owners = activeNoteOwners.get(source.note);

        if (owners) {
            owners.delete(sourceId);

            if (owners.size === 0) {
                keyboardSynth.triggerRelease(source.note);
                activeNoteOwners.delete(source.note);
            }
        }
    }

    /* Keep the key highlighted if another held input is still using this same on-screen key. */
    const elementStillHeld = Array.from(heldSources.values())
        .some((activeSource) => activeSource.element === source.element);

    if (!elementStillHeld) {
        source.element.classList.remove("activeKey");
    }
}

/* Release every active note when focus is lost, the tab is hidden, or the page becomes unresponsive for a while. This prevents sustained notes from getting stuck. */
function releaseAllActiveNotes() {
    activeNoteOwners.forEach((_owners, note) => {
        keyboardSynth.triggerRelease(note);
    });

    activeNoteOwners.clear();
    heldSources.clear();
    activeComputerKeys.clear();
    activePointerKeys.clear();
    pianoKeys.forEach((key) => key.classList.remove("activeKey"));
}

/* On-screen piano interaction supports mouse, pen and touch. The source is registered before waiting for audio so a fast pointer-up can cancel it safely. */
pianoKeys.forEach((key) => {
    key.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        event.preventDefault();

        try {
            key.setPointerCapture(event.pointerId);
        } catch (_error) {
            /* Pointer capture may fail if the pointer has already left the element. */
        }

        const sourceId = `pointer:${event.pointerId}`;
        const mappedKey = { note: key.dataset.note, element: key };
        const source = registerHeldSource(sourceId, mappedKey);
        activePointerKeys.set(event.pointerId, sourceId);

        playNote(sourceId, source).catch((error) => {
            console.error("Could not play the piano note.", error);
            releaseSource(sourceId);
            activePointerKeys.delete(event.pointerId);
        });
    });

    const releasePointer = (event) => {
        const sourceId = activePointerKeys.get(event.pointerId);
        if (!sourceId) {
            return;
        }

        releaseSource(sourceId);
        activePointerKeys.delete(event.pointerId);
    };

    key.addEventListener("pointerup", releasePointer);
    key.addEventListener("pointercancel", releasePointer);
    key.addEventListener("lostpointercapture", releasePointer);
});

/* A–K play the white keys and W/E/T/Y/U play the black keys. Only the computer keys that match the piano's black-key pattern are mapped. */
window.addEventListener("keydown", (event) => {
    const computerKey = event.key.toLowerCase();
    const mappedKey = computerKeyMap.get(computerKey);

    if (!mappedKey || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    event.preventDefault();

    if (activeComputerKeys.has(computerKey)) {
        return;
    }

    const sourceId = `keyboard:${computerKey}`;
    const source = registerHeldSource(sourceId, mappedKey);
    activeComputerKeys.set(computerKey, sourceId);

    playNote(sourceId, source).catch((error) => {
        console.error("Could not play the computer-key note.", error);
        releaseSource(sourceId);
        activeComputerKeys.delete(computerKey);
    });
});

/* Release the matching note on key-up. This also cancels a pending attack if audio was still resuming when the key was released. */
window.addEventListener("keyup", (event) => {
    const computerKey = event.key.toLowerCase();
    const sourceId = activeComputerKeys.get(computerKey);

    if (!sourceId) {
        return;
    }

    releaseSource(sourceId);
    activeComputerKeys.delete(computerKey);
});

/* Clear held notes whenever the page loses focus or becomes hidden, because the browser may not deliver every key-up event in those situations. */
window.addEventListener("blur", releaseAllActiveNotes);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
        releaseAllActiveNotes();
    }
});
window.addEventListener("pagehide", releaseAllActiveNotes);

/* A visible page can briefly freeze while audio continues on its own rendering thread. If the event loop resumes after a long gap, release held notes as a safety net. */
let lastWatchdogTick = performance.now();
window.setInterval(() => {
    const now = performance.now();
    const stalledFor = now - lastWatchdogTick;
    lastWatchdogTick = now;

    if (document.visibilityState !== "visible") {
        releaseAllActiveNotes();
        return;
    }

    if (stalledFor > 1200 && heldSources.size > 0) {
        console.warn("A long main-thread pause was detected; releasing held notes to prevent stuck audio.");
        releaseAllActiveNotes();
    }
}, 250);
