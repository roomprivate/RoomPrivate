// Function to get more detailed browser information
function getBrowserInfo() {
    const ua = navigator.userAgent;
    const browserInfo = {
        cookiesEnabled: navigator.cookieEnabled,
        language: navigator.language,
        platform: navigator.platform,
        doNotTrack: navigator.doNotTrack,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        colorDepth: window.screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        touchPoints: navigator.maxTouchPoints,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown'
    };

    // Check for WebGL support
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        browserInfo.webglVendor = gl ? gl.getParameter(gl.VENDOR) : 'none';
        browserInfo.webglRenderer = gl ? gl.getParameter(gl.RENDERER) : 'none';
    } catch (e) {
        browserInfo.webglVendor = 'error';
        browserInfo.webglRenderer = 'error';
    }

    return browserInfo;
}

// Function to send the information to the server
async function logAccess() {
    try {
        const info = getBrowserInfo();
        
        // Make a non-blocking request to log the access
        await fetch('/api/log-access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(info)
        });
    } catch (error) {
        console.error('Failed to log access:', error);
    }
}

// Log access when the page loads
document.addEventListener('DOMContentLoaded', logAccess);
