"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getRtcEnvironmentIssue, isRtcEnvironmentError } from "@/lib/rtcEnvironment";
import {
  AlertCircle,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";

function isOperationAborted(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  return (
    code === "OPERATION_ABORTED" ||
    message.includes("OPERATION_ABORTED") ||
    message.toLowerCase().includes("cancel token canceled")
  );
}

export default function VideoCallComponent({ callData, isVideo, onCallEnd }) {
  const [connectionState, setConnectionState] = useState("connecting");
  const [remotePresent, setRemotePresent] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(Boolean(isVideo));
  const [errorMessage, setErrorMessage] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const sessionRef = useRef(null);
  const endingRef = useRef(false);
  const callStartedAtRef = useRef(Date.now());

  const stopSession = async (session) => {
    if (!session) return;
    if (session.stopPromise) return session.stopPromise;

    session.stopping = true;

    session.stopPromise = (async () => {
      // Serialize teardown after every in-flight Agora operation. Calling leave()
      // while join()/publish() is still active is what produced OPERATION_ABORTED.
      for (const promiseName of ["joinPromise", "trackPromise", "publishPromise"]) {
        const operation = session[promiseName];
        if (operation) {
          try {
            await operation;
          } catch {
            // Startup error is handled by the initializer. Teardown still proceeds.
          }
        }
      }

      const tracks = [session.audioTrack, session.videoTrack].filter(Boolean);
      for (const track of tracks) {
        try {
          track.stop();
        } catch {}
        try {
          track.close();
        } catch {}
      }

      if (session.agora && session.autoplayHandler) {
        try {
          session.agora.off("autoplay-failed", session.autoplayHandler);
        } catch {}
      }

      if (session.client) {
        try {
          session.client.removeAllListeners();
        } catch {}

        if (session.joined) {
          try {
            await session.client.leave();
          } catch (error) {
            if (!isOperationAborted(error)) {
              console.error("Agora leave failed:", error);
            }
          }
        }
      }

      session.joined = false;
    })();

    return session.stopPromise;
  };

  useEffect(() => {
    let disposed = false;

    const session = {
      client: null,
      agora: null,
      autoplayHandler: null,
      audioTrack: null,
      videoTrack: null,
      joinPromise: null,
      trackPromise: null,
      publishPromise: null,
      stopPromise: null,
      joined: false,
      stopping: false,
    };

    sessionRef.current = session;
    endingRef.current = false;
    callStartedAtRef.current = Date.now();

    const start = async () => {
      try {
        // React Strict Mode runs an immediate setup/cleanup/setup cycle in dev.
        // Yield once so the throwaway setup can be disposed before touching RTC.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (disposed || session.stopping) return;

        const rtcIssue = getRtcEnvironmentIssue();
        if (rtcIssue) {
          setErrorMessage(rtcIssue.message);
          setConnectionState("failed");
          return;
        }

        const module = await import("agora-rtc-sdk-ng");
        if (disposed || session.stopping) return;

        const AgoraRTC = module.default;
        session.agora = AgoraRTC;
        session.autoplayHandler = () => {
          if (!disposed) setAutoplayBlocked(true);
        };
        AgoraRTC.on("autoplay-failed", session.autoplayHandler);

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        session.client = client;

        client.on("connection-state-change", (currentState) => {
          if (!disposed) {
            setConnectionState(String(currentState || "").toLowerCase());
          }
        });

        client.on("user-published", async (remoteUser, mediaType) => {
          if (session.stopping || disposed) return;

          try {
            await client.subscribe(remoteUser, mediaType);
            if (session.stopping || disposed) return;

            if (mediaType === "audio") {
              remoteUser.audioTrack?.play();
            }

            if (mediaType === "video" && remoteVideoRef.current) {
              remoteVideoRef.current.innerHTML = "";
              remoteUser.videoTrack?.play(remoteVideoRef.current);
            }

            setRemotePresent(true);
          } catch (error) {
            if (!session.stopping && !disposed && !isOperationAborted(error)) {
              console.error("Agora subscribe failed:", error);
            }
          }
        });

        client.on("user-unpublished", (remoteUser, mediaType) => {
          if (mediaType === "video" && remoteVideoRef.current) {
            remoteVideoRef.current.innerHTML = "";
          }

          const stillPublished = client.remoteUsers.some(
            (item) => item.hasAudio || item.hasVideo
          );
          setRemotePresent(stillPublished);
        });

        client.on("user-left", () => {
          const stillConnected = client.remoteUsers.some(
            (item) => item.hasAudio || item.hasVideo
          );
          setRemotePresent(stillConnected);
        });

        client.on("token-privilege-will-expire", async () => {
          if (session.stopping || disposed) return;

          try {
            const response = await fetch("/api/generate-agora-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channelName: callData.channelName,
                chatId: callData.chatId,
                uid: callData.uid,
              }),
            });

            const refreshed = await response.json();
            if (!response.ok || !refreshed.token) {
              throw new Error(refreshed.error || "Could not refresh Agora token");
            }

            await client.renewToken(refreshed.token);
          } catch (error) {
            console.error("Agora token refresh failed:", error);
          }
        });

        session.joinPromise = client.join(
          callData.appId,
          callData.channelName,
          callData.token,
          callData.uid
        );

        await session.joinPromise;
        session.joined = true;

        if (disposed || session.stopping) return;

        session.trackPromise = (async () => {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "speech_standard",
          });
          session.audioTrack = audioTrack;

          let videoTrack = null;
          if (isVideo) {
            videoTrack = await AgoraRTC.createCameraVideoTrack({
              optimizationMode: "motion",
              encoderConfig: "360p_7",
            });
            session.videoTrack = videoTrack;
          }

          return { audioTrack, videoTrack };
        })();

        const { audioTrack, videoTrack } = await session.trackPromise;
        session.audioTrack = audioTrack;
        session.videoTrack = videoTrack;

        if (disposed || session.stopping) return;

        const tracks = [audioTrack, videoTrack].filter(Boolean);
        session.publishPromise = client.publish(tracks);
        await session.publishPromise;

        if (disposed || session.stopping) return;

        if (videoTrack && localVideoRef.current) {
          localVideoRef.current.innerHTML = "";
          videoTrack.play(localVideoRef.current);
        }

        setMicOn(true);
        setCameraOn(Boolean(videoTrack));
        setConnectionState("connected");
      } catch (error) {
        if (disposed || session.stopping || isOperationAborted(error)) {
          return;
        }

        const message = String(error?.message || "");

        if (isRtcEnvironmentError(error)) {
          const rtcIssue = getRtcEnvironmentIssue();
          setErrorMessage(
            rtcIssue?.message ||
              "Audio/video calls require HTTPS or localhost with browser media support."
          );
        } else if (
          message.toLowerCase().includes("permission") ||
          message.toLowerCase().includes("notallowed")
        ) {
          setErrorMessage(
            "Microphone/camera permission was denied. Allow access in the browser and retry."
          );
        } else {
          console.error("Agora call initialization failed:", error);
          setErrorMessage("Could not connect the call. End the call and try again.");
        }
        setConnectionState("failed");
        await stopSession(session);
      }
    };

    start();

    return () => {
      disposed = true;
      stopSession(session).catch((error) => {
        if (!isOperationAborted(error)) {
          console.error("Agora cleanup failed:", error);
        }
      });
    };
    // A new call gets a new channel. Do not restart RTC for ordinary state changes.
  }, [
    callData.appId,
    callData.channelName,
    callData.token,
    callData.uid,
    callData.chatId,
    isVideo,
  ]);

  const toggleMic = async () => {
    const track = sessionRef.current?.audioTrack;
    if (!track || sessionRef.current?.stopping) return;

    const next = !micOn;
    try {
      await track.setEnabled(next);
      setMicOn(next);
    } catch (error) {
      if (!isOperationAborted(error)) {
        console.error("Could not toggle microphone:", error);
      }
    }
  };

  const toggleCamera = async () => {
    const track = sessionRef.current?.videoTrack;
    if (!track || sessionRef.current?.stopping) return;

    const next = !cameraOn;
    try {
      await track.setEnabled(next);
      setCameraOn(next);

      if (next && localVideoRef.current) {
        localVideoRef.current.innerHTML = "";
        track.play(localVideoRef.current);
      }
    } catch (error) {
      if (!isOperationAborted(error)) {
        console.error("Could not toggle camera:", error);
      }
    }
  };

  const resumeAudio = async () => {
    try {
      await sessionRef.current?.agora?.resumeAudioContext?.();
      setAutoplayBlocked(false);
    } catch (error) {
      console.error("Could not resume Agora audio:", error);
    }
  };

  const handleEndCall = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setConnectionState("ending");

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - callStartedAtRef.current) / 1000)
    );
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const duration =
      minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    await stopSession(sessionRef.current);
    await onCallEnd?.(duration);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background text-white">
      <div className="surface-panel m-3 flex items-center justify-between rounded-2xl border px-4 py-3">
        <div>
          <div className="text-sm font-bold">
            {isVideo ? "Video consultation" : "Voice consultation"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {connectionState === "connected"
              ? remotePresent
                ? "Connected"
                : "Connected · waiting for participant"
              : connectionState === "failed"
                ? "Connection failed"
                : connectionState === "ending"
                  ? "Ending call..."
                  : "Connecting securely..."}
          </div>
        </div>
        <span className="status-chip">Agora RTC</span>
      </div>

      {errorMessage && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {autoplayBlocked && (
        <button
          type="button"
          onClick={resumeAudio}
          className="mx-3 mb-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
        >
          Tap to enable call audio
        </button>
      )}

      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <>
            <div
              ref={remoteVideoRef}
              className="absolute inset-0 bg-card"
            />

            {!remotePresent && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <Video className="h-11 w-11 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-zinc-300">
                    Waiting for other participant
                  </p>
                </div>
              </div>
            )}

            <div
              ref={localVideoRef}
              className="absolute right-4 top-4 h-32 w-44 overflow-hidden rounded-2xl border border-white/15 bg-card shadow-2xl md:h-40 md:w-56"
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10">
                <Mic className="h-14 w-14 text-cyan-200" />
              </div>
              <h3 className="text-xl font-bold">Voice consultation</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {remotePresent ? "Participant connected" : "Waiting for participant..."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="surface-panel m-3 flex items-center justify-center gap-4 rounded-2xl border p-4">
        <Button
          type="button"
          onClick={toggleMic}
          size="lg"
          variant="outline"
          disabled={!sessionRef.current?.audioTrack || connectionState === "ending"}
          className={`h-12 w-12 rounded-full p-0 ${
            micOn ? "bg-white/5 text-white" : "bg-red-500/20 text-red-200"
          }`}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        {isVideo && (
          <Button
            type="button"
            onClick={toggleCamera}
            size="lg"
            variant="outline"
            disabled={!sessionRef.current?.videoTrack || connectionState === "ending"}
            className={`h-12 w-12 rounded-full p-0 ${
              cameraOn ? "bg-white/5 text-white" : "bg-red-500/20 text-red-200"
            }`}
            aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Button>
        )}

        <Button
          type="button"
          onClick={handleEndCall}
          size="lg"
          disabled={connectionState === "ending"}
          className="h-12 w-12 rounded-full bg-red-600 p-0 text-white hover:bg-red-500"
          aria-label="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
