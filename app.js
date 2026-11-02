
/*
 * QR Scanner
 * Browser: HTML5 QR Code
 * Android: AUSBC native camera bridge
 */

let html5QrCode = null;
let browserCameras = [];
let selectedCameraId = "";
let selectedMode = "back";
let scannerRunning = false;
let scannerMode = "browser";

let lastDecodedText = "";
let lastDecodedAt = 0;

const $ = (id) => document.getElementById(id);

function hasAndroidBridge() {
    return typeof window.AndroidUsbCamera !== "undefined";
}

document.addEventListener("DOMContentLoaded", async () => {

    if (typeof Html5Qrcode !== "undefined") {
        html5QrCode = new Html5Qrcode("reader");
    }

    $("start-scanner").addEventListener("click", startScanner);
    $("stop-scanner").addEventListener("click", stopScanner);
    $("refresh-cameras").addEventListener("click", refreshCameras);
    $("copy-result").addEventListener("click", copyResult);
    $("btn-usb-camera").addEventListener("click", selectUsbMode);

    $("camera-select").addEventListener("change", async (event) => {

        selectedCameraId = event.target.value;

        const camera = browserCameras.find(
            c => c.id === selectedCameraId
        );

        selectedMode = inferCameraMode(camera?.label || "");

        updateModeButtons();

        if (scannerRunning && scannerMode === "browser") {
            await restartBrowserScanner();
        }
    });

    document.querySelectorAll(".camera-choice").forEach(button => {
        button.addEventListener("click", () => {
            selectBrowserMode(button.dataset.mode);
        });
    });

    // Android sends QR results here.
    window.onNativeQrScanned = function (decodedText) {

        if (!decodedText) return;

        displayScanResult(
            decodedText,
            "USB OTG Camera"
        );
    };

    // Android camera status callback.
    window.onNativeCameraStatus = function (status, message = "") {

        status = String(status).toLowerCase();

        if (status === "started" || status === "scanning") {

            scannerRunning = true;
            scannerMode = "native";

            setRunningUI(true, "USB camera scanning");

            $("camera-placeholder").classList.add("hidden");

            $("native-preview-placeholder").classList.remove("hidden");
            $("native-preview-placeholder").classList.add("flex");

        } else if (
            status === "stopped" ||
            status === "disconnected" ||
            status === "error"
        ) {

            scannerRunning = false;

            setRunningUI(false, "Stopped");

            $("camera-placeholder").classList.remove("hidden");

            $("native-preview-placeholder").classList.add("hidden");
            $("native-preview-placeholder").classList.remove("flex");
        }

        if (message) {
            showMessage(message, status === "error");
        }
    };

    await refreshCameras(false);

    if (hasAndroidBridge()) {
        $("camera-help").textContent =
            "Android companion app detected. USB OTG is available.";
    }
});


// ========================================
// CAMERA DETECTION
// ========================================

async function refreshCameras(showNotice = true) {

    const select = $("camera-select");

    $("camera-count").textContent = "Detecting...";

    if (!navigator.mediaDevices?.enumerateDevices) {

        $("camera-count").textContent = "Unavailable";

        select.replaceChildren(
            new Option("Browser camera API unavailable", "")
        );

        return;
    }

    try {

        const devices =
            await navigator.mediaDevices.enumerateDevices();

        browserCameras = devices
            .filter(device => device.kind === "videoinput")
            .map(device => ({
                id: device.deviceId,
                label: device.label
            }));

        renderBrowserCameraOptions();

        if (
            !selectedCameraId ||
            !browserCameras.some(c => c.id === selectedCameraId)
        ) {

            const preferred = findBrowserCamera(selectedMode);

            selectedCameraId =
                preferred?.id || browserCameras[0]?.id || "";
        }

        select.value = selectedCameraId;

        $("camera-count").textContent =
            `${browserCameras.length} browser camera(s)`;

        if (showNotice) {
            showMessage("Camera list refreshed.");
        }

    } catch (error) {

        $("camera-count").textContent = "Detection failed";

        showMessage(error.message, true);
    }
}


function renderBrowserCameraOptions() {

    const select = $("camera-select");

    select.replaceChildren();

    if (!browserCameras.length) {

        select.add(
            new Option("No browser cameras detected", "")
        );

        return;
    }

    browserCameras.forEach((camera, index) => {

        select.add(
            new Option(
                camera.label || `Camera ${index + 1}`,
                camera.id
            )
        );
    });
}


function inferCameraMode(label) {

    if (/back|rear|environment/i.test(label)) {
        return "back";
    }

    if (/front|user|selfie|facetime/i.test(label)) {
        return "front";
    }

    return "webcam";
}


function findBrowserCamera(mode) {

    if (mode === "back") {
        return browserCameras.find(c =>
            /back|rear|environment/i.test(c.label)
        );
    }

    if (mode === "front") {
        return browserCameras.find(c =>
            /front|user|selfie|facetime/i.test(c.label)
        );
    }

    if (mode === "webcam") {
        return browserCameras.find(c =>
            /webcam|usb|integrated/i.test(c.label)
        );
    }

    return null;
}


// ========================================
// CAMERA SELECTION
// ========================================

function updateModeButtons() {

    document.querySelectorAll(".camera-choice").forEach(button => {

        button.setAttribute(
            "aria-pressed",
            String(button.dataset.mode === selectedMode)
        );
    });
}


async function selectBrowserMode(mode) {

    if (!html5QrCode) {
        showMessage("QR scanner library unavailable.", true);
        return;
    }

    selectedMode = mode;
    scannerMode = "browser";

    const camera = findBrowserCamera(mode);

    selectedCameraId = camera?.id || "";

    if (selectedCameraId) {
        $("camera-select").value = selectedCameraId;
    }

    updateModeButtons();

    $("native-preview-placeholder").classList.add("hidden");
    $("native-preview-placeholder").classList.remove("flex");

    if (scannerRunning && scannerMode === "browser") {
        await restartBrowserScanner();
    }
}


// ========================================
// USB OTG CAMERA
// ========================================

function selectUsbMode() {

    selectedMode = "usb";
    scannerMode = "native";

    updateModeButtons();

    $("camera-help").textContent =
        "USB OTG requires the Android companion application.";

    if (!hasAndroidBridge()) {

        showMessage(
            "USB OTG is available only inside the Android companion app.",
            true
        );

        return;
    }

    $("camera-placeholder").classList.add("hidden");

    $("native-preview-placeholder").classList.remove("hidden");
    $("native-preview-placeholder").classList.add("flex");

    showMessage("Requesting USB camera...");

    try {

        window.AndroidUsbCamera.startUsbScanner();

    } catch (error) {

        showMessage(
            "USB camera error: " + error.message,
            true
        );
    }
}


// ========================================
// START SCANNER
// ========================================

async function startScanner() {

    if (scannerRunning) return;

    if (selectedMode === "usb" || scannerMode === "native") {

        if (!hasAndroidBridge()) {

            showMessage(
                "Open this website inside the Android companion app.",
                true
            );

            return;
        }

        try {

            window.AndroidUsbCamera.startUsbScanner();

            showMessage("Starting USB camera...");

        } catch (error) {

            showMessage(error.message, true);
        }

        return;
    }

    await startBrowserScanner();
}


async function startBrowserScanner() {

    if (!html5QrCode) {

        showMessage(
            "HTML5 QR library not loaded.",
            true
        );

        return;
    }

    scannerMode = "browser";

    $("camera-placeholder").classList.add("hidden");

    setRunningUI(false, "Starting...");

    const cameraConfig = selectedCameraId || {
        facingMode:
            selectedMode === "front"
                ? "user"
                : "environment"
    };

    try {

        await html5QrCode.start(

            cameraConfig,

            {
                fps: 10,

                // QR scanning square size: 50%
                qrbox: (width, height) => {

                    const size = Math.floor(
                        Math.min(width, height) * 0.50
                    );

                    return {
                        width: size,
                        height: size
                    };
                },

                aspectRatio: 1
            },

            (decodedText) => {

                displayScanResult(
                    decodedText,
                    getSelectedCameraLabel()
                );

            },

            () => { }

        );

        scannerRunning = true;

        setRunningUI(true, "Scanning");

        showMessage(
            "Camera active. Point it at a QR code."
        );

        await refreshCameras(false);

    } catch (error) {

        scannerRunning = false;

        setRunningUI(false, "Stopped");

        $("camera-placeholder").classList.remove("hidden");

        showMessage(getCameraError(error), true);
    }
}


// ========================================
// STOP SCANNER
// ========================================

async function stopScanner() {

    if (scannerMode === "native" || selectedMode === "usb") {

        if (hasAndroidBridge()) {

            try {

                window.AndroidUsbCamera.stopUsbScanner();

            } catch (error) {

                showMessage(error.message, true);
            }
        }

        scannerRunning = false;

        setRunningUI(false, "Stopped");

        $("camera-placeholder").classList.remove("hidden");

        $("native-preview-placeholder").classList.add("hidden");
        $("native-preview-placeholder").classList.remove("flex");

        return;
    }

    await stopBrowserScanner();
}


async function stopBrowserScanner() {

    if (html5QrCode && scannerRunning) {

        try {

            await html5QrCode.stop();

        } catch (error) {

            console.warn(error);
        }
    }

    scannerRunning = false;

    setRunningUI(false, "Stopped");

    $("camera-placeholder").classList.remove("hidden");
}


async function restartBrowserScanner() {

    await stopBrowserScanner();

    await startBrowserScanner();
}


// ========================================
// QR SCAN RESULT
// ========================================

function displayScanResult(decodedText, source) {

    const now = Date.now();

    // Avoid duplicate scan callbacks.
    if (
        decodedText === lastDecodedText &&
        now - lastDecodedAt < 1500
    ) {
        return;
    }

    lastDecodedText = decodedText;
    lastDecodedAt = now;

    $("decoded-data").textContent = decodedText;

    $("result-hint").textContent =
        "QR code scanned successfully.";

    $("result-source").textContent =
        "Source: " + source;

    $("result-time").textContent =
        "Time: " + new Date().toLocaleTimeString();

    $("copy-result").disabled = false;

    showMessage("QR code scanned successfully.");
}


// ========================================
// COPY DATA
// ========================================

async function copyResult() {

    const value = $("decoded-data").textContent;

    if (
        !value ||
        value.startsWith("Waiting for QR scan")
    ) {
        return;
    }

    try {

        await navigator.clipboard.writeText(value);

        showMessage("Scanned data copied.");

    } catch {

        showMessage(
            "Clipboard access failed. Copy manually.",
            true
        );
    }
}


// ========================================
// UI HELPERS
// ========================================

function getSelectedCameraLabel() {

    const camera = browserCameras.find(
        c => c.id === selectedCameraId
    );

    return camera?.label ||
        (selectedMode === "front"
            ? "Phone front camera"
            : "Phone back camera / webcam");
}


function setRunningUI(running, statusText) {

    $("start-scanner").disabled = running;

    $("stop-scanner").disabled = !running;

    $("scan-status").textContent = statusText;

    $("status-dot").className = running
        ? "h-2 w-2 rounded-full bg-emerald-400"
        : "h-2 w-2 rounded-full bg-slate-500";
}


function getCameraError(error) {

    const message = String(
        error?.message || error || ""
    );

    if (/permission|denied|notallowed/i.test(message)) {

        return "Camera permission denied. Allow camera access.";
    }

    if (/notfound|no camera/i.test(message)) {

        return "Camera not found. Select another camera.";
    }

    if (/secure|https/i.test(message)) {

        return "Camera access requires HTTPS or localhost.";
    }

    return "Could not start camera: " + message;
}


function showMessage(message, isError = false) {

    $("scanner-message").textContent = message;

    $("scanner-message").className =
        "mt-3 min-h-5 text-center text-xs " +
        (isError ? "text-rose-400" : "text-slate-400");
}
