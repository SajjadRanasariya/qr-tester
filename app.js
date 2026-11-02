
let qrScanner;
let cameras = [];
let selectedCameraId = "";
let selectedMode = "back";
let isScanning = false;
let lastDecodedText = "";
let lastDecodedAt = 0;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
    qrScanner = new Html5Qrcode("reader");

    $("start-scanner").addEventListener("click", startScanner);
    $("stop-scanner").addEventListener("click", stopScanner);
    $("refresh-cameras").addEventListener("click", refreshCameras);
    $("copy-result").addEventListener("click", copyResult);

    $("camera-select").addEventListener("change", async (event) => {
        selectedCameraId = event.target.value;
        const camera = cameras.find(c => c.id === selectedCameraId);

        if (camera) {
            selectedMode = inferMode(camera.label || "");
            updateModeButtons();
        }

        if (isScanning) await restartScanner();
    });

    document.querySelectorAll(".camera-choice").forEach(button => {
        button.addEventListener("click", () => {
            chooseMode(button.dataset.mode);
        });
    });

    await refreshCameras(false);
});

async function refreshCameras(showMessage = true) {
    $("camera-status").textContent = "Detecting cameras...";

    try {
        cameras = await Html5Qrcode.getCameras();
        renderCameraOptions();

        if (!cameras.length) {
            $("camera-status").textContent = "No cameras found.";
            return;
        }

        if (!selectedCameraId ||
            !cameras.some(c => c.id === selectedCameraId)) {
            const preferred = findCamera(selectedMode);
            selectedCameraId = preferred?.id || cameras[0].id;
        }

        $("camera-select").value = selectedCameraId;

        const selected = cameras.find(c => c.id === selectedCameraId);

        $("camera-status").textContent =
            `${cameras.length} camera(s) detected` +
            (selected?.label ? ` · Selected: ${selected.label}` : "");

        if (showMessage) showMessageText("Camera list refreshed.");

    } catch (error) {
        $("camera-status").textContent =
            "Allow camera permission when starting the scanner.";

        if (showMessage) showMessageText(getErrorMessage(error), true);
    }
}

function renderCameraOptions() {
    const select = $("camera-select");
    select.replaceChildren();

    if (!cameras.length) {
        select.add(new Option("No cameras detected", ""));
        return;
    }

    cameras.forEach((camera, index) => {
        select.add(new Option(
            camera.label || `Camera ${index + 1}`,
            camera.id
        ));
    });
}

function inferMode(label) {
    const value = label.toLowerCase();

    if (/back|rear|environment/.test(value)) return "back";
    if (/front|user|selfie|facetime/.test(value)) return "front";

    return "webcam";
}

function findCamera(mode) {
    if (mode === "back") {
        return cameras.find(c =>
            /back|rear|environment/i.test(c.label || "")
        );
    }

    if (mode === "front") {
        return cameras.find(c =>
            /front|user|selfie|facetime/i.test(c.label || "")
        );
    }

    return cameras.find(c =>
        /webcam|usb|integrated/i.test(c.label || "")
    );
}

async function chooseMode(mode) {
    selectedMode = mode;
    const matched = findCamera(mode);

    if (matched) {
        selectedCameraId = matched.id;
        $("camera-select").value = matched.id;

        $("camera-status").textContent =
            `Selected: ${matched.label || "Camera device"}`;

    } else if (mode === "webcam") {
        showMessageText(
            "No webcam identified. Select a device from the list.",
            true
        );
        return;
    } else {
        selectedCameraId = "";

        $("camera-status").textContent =
            `Will request the ${mode === "back" ? "rear" : "front"} camera.`;
    }

    updateModeButtons();

    if (isScanning) await restartScanner();
}

function updateModeButtons() {
    document.querySelectorAll(".camera-choice").forEach(button => {
        button.setAttribute(
            "aria-pressed",
            String(button.dataset.mode === selectedMode)
        );
    });
}

async function startScanner() {
    if (isScanning) return;

    setControls(true);
    $("camera-placeholder").classList.add("hidden");

    try {
        const cameraConfig = selectedCameraId || {
            facingMode: selectedMode === "front"
                ? "user"
                : "environment"
        };

        await qrScanner.start(
            cameraConfig,
            {
                fps: 10,
                qrbox: (width, height) => {
                    const size = Math.floor(
                        Math.min(width, height) * 0.50
                    );

                    return {
                        width: Math.max(180, size),
                        height: Math.max(180, size)
                    };
                },
                aspectRatio: 1
            },
            handleScan,
            () => { }
        );

        isScanning = true;
        setControls(false);

        $("scan-status").lastChild.textContent = " Scanning";
        $("status-dot").className =
            "h-2 w-2 rounded-full bg-emerald-400";

        $("camera-status").textContent =
            "Camera active. Point it at a QR code.";

        await refreshCameras(false);

    } catch (error) {
        isScanning = false;
        setControls(false);

        $("camera-placeholder").classList.remove("hidden");

        $("scan-status").lastChild.textContent = " Stopped";
        $("status-dot").className =
            "h-2 w-2 rounded-full bg-slate-500";

        showMessageText(getErrorMessage(error), true);
    }
}

async function stopScanner() {
    if (!isScanning) return;

    try {
        await qrScanner.stop();
    } catch (error) {
        console.warn("Stop error:", error);
    }

    isScanning = false;
    setControls(false);

    $("camera-placeholder").classList.remove("hidden");

    $("scan-status").lastChild.textContent = " Stopped";
    $("status-dot").className =
        "h-2 w-2 rounded-full bg-slate-500";

    $("camera-status").textContent = "Camera stopped.";
}

async function restartScanner() {
    if (isScanning) {
        try {
            await qrScanner.stop();
        } catch (error) {
            console.warn(error);
        }

        isScanning = false;
    }

    await startScanner();
}

function handleScan(decodedText) {
    const now = Date.now();

    // Prevent repeated duplicate results.
    if (
        decodedText === lastDecodedText &&
        now - lastDecodedAt < 1500
    ) return;

    lastDecodedText = decodedText;
    lastDecodedAt = now;

    $("decoded-data").textContent = decodedText;
    $("result-hint").textContent =
        "QR code scanned successfully.";

    $("result-meta").textContent =
        `Scanned at ${new Date().toLocaleTimeString()}`;

    $("copy-result").disabled = false;

    $("status-dot").className =
        "h-2 w-2 rounded-full bg-emerald-400";

    showMessageText("QR code scanned successfully.");
}

async function copyResult() {
    const text = $("decoded-data").textContent;

    if (!text || text === "Waiting for QR scan...") return;

    try {
        await navigator.clipboard.writeText(text);
        showMessageText("Scanned data copied.");
    } catch {
        showMessageText(
            "Clipboard access failed. Copy manually.",
            true
        );
    }
}

function setControls(starting) {
    $("start-scanner").disabled = starting || isScanning;
    $("stop-scanner").disabled = starting || !isScanning;
}

function getErrorMessage(error) {
    const message = String(error?.message || error || "");

    if (/permission|denied|notallowed/i.test(message)) {
        return "Camera permission denied. Allow camera access in browser settings.";
    }

    if (/notfound|no camera|device/i.test(message)) {
        return "Camera not found. Connect a camera or select another.";
    }

    return `Could not start camera: ${message}`;
}

function showMessageText(message, isError = false) {
    $("message").textContent = message;

    $("message").className =
        `min-h-5 text-center text-xs ${isError ? "text-rose-400" : "text-slate-400"
        }`;
}
