/*
 * Keyboard controller
 * White keys: A S D F G H J K
 * Black keys: W E T Y U
 * Computer keys trigger one octave of piano notes; mouse/touch uses the same keys.
 */

/* Read the piano keys from the HTML. Their data attributes define both the note and its computer-key shortcut, so the mapping stays easy to edit. */

const pianoKeys = Array.from(document.querySelectorAll(".whiteKey, .blackKey"));
const computerKeyMap = new Map(
    pianoKeys.map((key) => [key.dataset.pcKey, {
        note: key.dataset.note,
        element: key
    }])
);
const activeComputerKeys = new Map();

/* Start the audio if needed, play the note, and highlight its on-screen key. One function keeps mouse and computer-key input consistent. */

async function playNote(note, keyElement) {
    await ensureAudio();
    keyboardSynth.triggerAttack(note);
    keyElement?.classList.add("activeKey");
}

/* Release the note and remove its highlight when the user lets go, so the interface reflects the actual input state. */

function releaseNote(note, keyElement) {
    keyboardSynth.triggerRelease(note);
    keyElement?.classList.remove("activeKey");
}

/* Pointer input lets users click, tap or hold the on-screen piano. Pointer events cover mouse and touch without separate handlers. */

pianoKeys.forEach((key) => {
    key.addEventListener("pointerdown", async (event) => {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        event.preventDefault();
        key.setPointerCapture(event.pointerId);
        await playNote(key.dataset.note, key);
    });

    key.addEventListener("pointerup", () => {
        releaseNote(key.dataset.note, key);
    });

    key.addEventListener("pointercancel", () => {
        releaseNote(key.dataset.note, key);
    });

    key.addEventListener("lostpointercapture", () => {
        releaseNote(key.dataset.note, key);
    });
});

/* Map A–K to the eight white keys and W/E/T/Y/U to the five black keys. 
I only use the computer keys that line up with the piano pattern, so the first white key has no black-key shortcut above it. */

window.addEventListener("keydown", async (event) => {
    const computerKey = event.key.toLowerCase();
    const mappedKey = computerKeyMap.get(computerKey);

    if (!mappedKey || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    event.preventDefault();
    if (activeComputerKeys.has(computerKey)) {
        return;
    }

    activeComputerKeys.set(computerKey, mappedKey);
    await playNote(mappedKey.note, mappedKey.element);
});

/* Release each computer-played note on key-up, which lets users hold notes instead of triggering only short clicks. */

window.addEventListener("keyup", (event) => {
    const computerKey = event.key.toLowerCase();
    const mappedKey = activeComputerKeys.get(computerKey);

    if (!mappedKey) {
        return;
    }

    releaseNote(mappedKey.note, mappedKey.element);
    activeComputerKeys.delete(computerKey);
});

/* If the browser window loses focus, release any held notes to prevent a note from getting stuck. */

window.addEventListener("blur", () => {
    activeComputerKeys.forEach(({ note, element }) => {
        releaseNote(note, element);
    });
    activeComputerKeys.clear();
});