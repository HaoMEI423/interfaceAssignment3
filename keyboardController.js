/*
 * Keyboard controller
 * White keys: A S D F G H J K
 * Black keys: W E T Y U
 * Computer keys trigger one octave of piano notes; mouse/touch uses the same keys.
 */

const pianoKeys = Array.from(document.querySelectorAll(".whiteKey, .blackKey"));
const computerKeyMap = new Map(
    pianoKeys.map((key) => [key.dataset.pcKey, {
        note: key.dataset.note,
        element: key
    }])
);
const activeComputerKeys = new Map();

async function playNote(note, keyElement) {
    await ensureAudio();
    keyboardSynth.triggerAttack(note);
    keyElement?.classList.add("activeKey");
}

function releaseNote(note, keyElement) {
    keyboardSynth.triggerRelease(note);
    keyElement?.classList.remove("activeKey");
}

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

window.addEventListener("keyup", (event) => {
    const computerKey = event.key.toLowerCase();
    const mappedKey = activeComputerKeys.get(computerKey);

    if (!mappedKey) {
        return;
    }

    releaseNote(mappedKey.note, mappedKey.element);
    activeComputerKeys.delete(computerKey);
});

window.addEventListener("blur", () => {
    activeComputerKeys.forEach(({ note, element }) => {
        releaseNote(note, element);
    });
    activeComputerKeys.clear();
});