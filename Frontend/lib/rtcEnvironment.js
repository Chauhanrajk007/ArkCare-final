export function getRtcEnvironmentIssue() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  const hostname = window.location.hostname;
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");

  const secureEnough = window.isSecureContext || isLoopback;

  if (!secureEnough) {
    return {
      code: "insecure-context",
      title: "Secure connection required",
      message:
        "Audio and video calls require HTTPS (or localhost). Open ArkCare from its HTTPS deployment, or run the local HTTPS dev server with `npm run dev:https`. Browsers block microphone and camera access on ordinary http:// LAN addresses.",
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      code: "get-user-media-unavailable",
      title: "Microphone/camera unavailable",
      message:
        "This browser context does not expose microphone/camera access. Use a current browser, allow site permissions, and open ArkCare through HTTPS or localhost.",
    };
  }

  return null;
}

export function isRtcEnvironmentError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error || "").toLowerCase();

  return (
    code === "WEB_SECURITY_RESTRICT" ||
    code === "NOT_SUPPORTED" ||
    message.includes("web_security_restrict") ||
    message.includes("web security") ||
    message.includes("getusermedia") ||
    message.includes("secure context") ||
    message.includes("https protocol")
  );
}
