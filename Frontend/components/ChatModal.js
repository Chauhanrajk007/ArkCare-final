"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, MessageCircle, User, Stethoscope,
  Image as ImageIcon, Loader2, X, Phone, Video,
  PhoneIncoming, FileText
} from "lucide-react";
import { pusherClient } from "@/lib/pusher";
import {
  createOrGetChat,
  getChatMessages,
  sendMessage,
  sendImageMessage,
} from "@/actions/chatActions";
import VideoCallComponent from "./VideoCallComponent";
import DoctorReportDialog from "@/components/carequest/DoctorReportDialog";
import { getRtcEnvironmentIssue } from "@/lib/rtcEnvironment";

export default function ChatModal({ appointment, isOpen, onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);

  // Image upload states
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Call states
  const [callState, setCallState] = useState('idle'); // idle, initiating, calling, ringing, connected
  const [incomingCall, setIncomingCall] = useState(null);
  const [callData, setCallData] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [rtcNotice, setRtcNotice] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const callStateRef = useRef(callState);
  const activeCallChannelRef = useRef(null);

  const updateCallState = (nextState) => {
    callStateRef.current = nextState;
    setCallState(nextState);
  };

  const userRole = user?.publicMetadata?.role;
  const isDoctor = userRole === "doctor";
  const otherUser = isDoctor ? appointment.patient : appointment.doctor;

  // Initialize chat when modal opens
  useEffect(() => {
    if (isOpen && appointment) {
      initializeChat();
    }

    return () => {
      if (chatId) {
        pusherClient.unsubscribe(`private-chat-${chatId}`);
      }
    };
  }, [isOpen, appointment]);

  // Setup Pusher connection
  useEffect(() => {
    if (chatId) {
      setRealtimeReady(false);
      const channel = pusherClient.subscribe(`private-chat-${chatId}`);

      channel.bind("pusher:subscription_succeeded", async () => {
        setRealtimeReady(true);

        // Reconcile anything sent while private-channel authorization was still
        // completing. This also makes reconnects lossless for chat messages.
        try {
          const latest = await getChatMessages(chatId);
          setMessages((prev) => {
            const byId = new Map();
            for (const item of [...prev, ...latest]) {
              byId.set(String(item._id), item);
            }
            return Array.from(byId.values()).sort(
              (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
            );
          });
        } catch (error) {
          console.error("Could not reconcile chat after realtime connect:", error);
        }
      });

      channel.bind("pusher:subscription_error", () => {
        setRealtimeReady(false);
      });

      channel.bind("new-message", (message) => {
        setMessages((prev) => {
          if (prev.some((item) => String(item._id) === String(message._id))) {
            return prev;
          }
          return [...prev, message];
        });
        scrollToBottom();
      });

      // Call-related events
      channel.bind("call-initiated", (callInfo) => {
        if (callInfo.initiatorId !== user?.id && callStateRef.current === "idle") {
          activeCallChannelRef.current = callInfo.channelName;
          setIncomingCall(callInfo);
          updateCallState("ringing");
        }
      });

      channel.bind("call-response", (response) => {
        const activeChannel = activeCallChannelRef.current;
        if (!activeChannel || response.channelName !== activeChannel) {
          return;
        }

        if (response.accepted) {
          updateCallState("connected");
        } else {
          activeCallChannelRef.current = null;
          updateCallState("idle");
          setCallData(null);
        }
        setIncomingCall(null);
      });

      channel.bind("call-ended", (event = {}) => {
        const activeChannel = activeCallChannelRef.current;
        if (!activeChannel || event.channelName !== activeChannel) {
          return;
        }

        activeCallChannelRef.current = null;
        updateCallState("idle");
        setIncomingCall(null);
        setCallData(null);
      });

      return () => {
        setRealtimeReady(false);
        pusherClient.unsubscribe(`private-chat-${chatId}`);
      };
    }
  }, [chatId, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeChat = async () => {
    try {
      setLoading(true);
      const chat = await createOrGetChat(appointment._id);
      setChatId(chat._id);
      const existingMessages = await getChatMessages(chat._id);
      setMessages(existingMessages);
    } catch (error) {
      console.error("Error initializing chat:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId || sending) return;

    setSending(true);

    try {
      const sent = await sendMessage(chatId, newMessage.trim());
      setMessages((prev) => {
        if (prev.some((item) => String(item._id) === String(sent._id))) return prev;
        return [...prev, sent];
      });
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  // Call Functions
  const fetchAgoraCredentials = async (channelName) => {
    const response = await fetch("/api/generate-agora-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelName, chatId }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to generate Agora token");
    }

    return {
      ...data,
      chatId,
    };
  };

  const sendCallEvent = async (event, data = {}) => {
    const response = await fetch("/api/send-pusher-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: `private-chat-${chatId}`,
        event,
        data,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Call signaling failed");
    }
  };

  const initiateCall = async (callType) => {
    if (callState !== "idle" || !chatId || !realtimeReady) return;

    const rtcIssue = getRtcEnvironmentIssue();
    if (rtcIssue) {
      setRtcNotice(rtcIssue.message);
      return;
    }

    setRtcNotice("");

    try {
      updateCallState("initiating");
      setIsVideo(callType === "video");

      const channelName = `ark-${chatId}-${Date.now()}`;
      activeCallChannelRef.current = channelName;
      const credentials = await fetchAgoraCredentials(channelName);

      setCallData(credentials);

      await sendCallEvent("call-initiated", {
        channelName,
        callType,
        initiatorId: user?.id,
        initiatorName: isDoctor
          ? appointment.doctor?.name
          : appointment.patient?.name,
      });

      // The receiver can accept before this trigger request resolves. Never
      // overwrite an already-connected state with "calling" on fast accepts.
      if (callStateRef.current === "initiating") {
        updateCallState("calling");
      }
    } catch (error) {
      console.error("Error initiating call:", error);
      updateCallState("idle");
      setCallData(null);
      alert(error.message || "Failed to start call. Please try again.");
    }
  };

  const acceptCall = async () => {
    if (!incomingCall || !chatId) return;

    const rtcIssue = getRtcEnvironmentIssue();
    if (rtcIssue) {
      setRtcNotice(rtcIssue.message);
      try {
        await sendCallEvent("call-response", {
          accepted: false,
          channelName: incomingCall.channelName,
        });
      } catch {}
      setIncomingCall(null);
      activeCallChannelRef.current = null;
      setCallData(null);
      updateCallState("idle");
      return;
    }

    setRtcNotice("");

    try {
      updateCallState("initiating");
      const credentials = await fetchAgoraCredentials(incomingCall.channelName);

      setCallData(credentials);
      setIsVideo(incomingCall.callType === "video");

      await sendCallEvent("call-response", {
        accepted: true,
        channelName: incomingCall.channelName,
      });
      setIncomingCall(null);
      updateCallState("connected");
    } catch (error) {
      console.error("Error accepting call:", error);
      try {
        await sendCallEvent("call-response", {
          accepted: false,
          channelName: incomingCall?.channelName,
        });
      } catch {}
      setIncomingCall(null);
      setCallData(null);
      updateCallState("idle");
      alert(error.message || "Could not join the call.");
    }
  };

  const declineCall = async () => {
    if (!incomingCall) return;

    try {
      await sendCallEvent("call-response", {
        accepted: false,
        channelName: incomingCall.channelName,
      });
    } catch (error) {
      console.error("Error declining call:", error);
    }

    setIncomingCall(null);
    activeCallChannelRef.current = null;
    setCallData(null);
    updateCallState("idle");
  };

  const cancelOutgoingCall = async () => {
    try {
      await sendCallEvent("call-ended", {
        channelName: activeCallChannelRef.current,
      });
    } catch (error) {
      console.error("Error cancelling call:", error);
    }

    setCallData(null);
    updateCallState("idle");
  };

  const endCall = async (duration) => {
    const endingChannel = callData?.channelName || activeCallChannelRef.current;
    try {
      await sendCallEvent("call-ended", { channelName: endingChannel });

      if (duration) {
        const callMessage = `📞 ${isVideo ? "Video" : "Voice"} call ended • Duration: ${duration}`;
        await sendMessage(chatId, callMessage);
      }
    } catch (error) {
      console.error("Error ending call:", error);
    } finally {
      activeCallChannelRef.current = null;
      updateCallState("idle");
      setCallData(null);
      setIncomingCall(null);
    }
  };

  // Image upload functions (keep existing ones)
  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      alert("Please select a valid image file (JPEG, PNG, WebP, or GIF)");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File size must be less than 5MB");
      return;
    }

    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async () => {
    if (!selectedImage || !chatId || uploading) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedImage);
      formData.append('chatId', chatId);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const { imageUrl, publicId } = await response.json();

      const sent = await sendImageMessage(chatId, imageUrl, publicId);
      setMessages((prev) => {
        if (prev.some((item) => String(item._id) === String(sent._id))) return prev;
        return [...prev, sent];
      });

      setSelectedImage(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleCancelImageUpload = () => {
    setSelectedImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleClose = (nextOpen) => {
    if (nextOpen === true) return;

    const state = callStateRef.current;
    if (chatId && state === "ringing" && incomingCall) {
      void sendCallEvent("call-response", { accepted: false }).catch(() => {});
    } else if (
      chatId &&
      ["initiating", "calling", "connected"].includes(state)
    ) {
      void sendCallEvent("call-ended").catch(() => {});
    }

    if (chatId) {
      pusherClient.unsubscribe(`private-chat-${chatId}`);
    }
    setChatId(null);
    setMessages([]);
    setLoading(true);
    setSending(false);
    setRealtimeReady(false);
    setSelectedImage(null);
    setPreviewUrl(null);
    setUploading(false);
    setRtcNotice("");
    updateCallState('idle');
    setCallData(null);
    setIncomingCall(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  const renderMessage = (message, index) => {
    const isOwnMessage = message.senderId === user?.id;

    return (
      <div
        key={message._id || index}
        className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`max-w-[70%] rounded-lg px-3 py-2 ${isOwnMessage
            ? "bg-green-600 text-white"
            : "bg-muted text-zinc-300"
            }`}
        >
          <div className="flex items-center space-x-1 mb-1">
            {message.senderType === "doctor" ? (
              <Stethoscope className="h-3 w-3" />
            ) : (
              <User className="h-3 w-3" />
            )}
            <span className="text-xs font-medium">{message.senderName}</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(message.createdAt)}
            </span>
          </div>

          {message.imageUrl ? (
            <div className="space-y-2">
              <img
                src={message.imageUrl}
                alt="Uploaded image"
                className="max-w-full h-auto rounded cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.imageUrl, '_blank')}
                loading="lazy"
              />
            </div>
          ) : (
            <p className="text-sm">{message.message}</p>
          )}
        </div>
      </div>
    );
  };

  // If in call, show call component
  if (callState === 'connected' && callData) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl h-[80vh] p-0 bg-card border-border">
          <VideoCallComponent
            callData={callData}
            isVideo={isVideo}
            onCallEnd={endCall}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0 bg-card border-border">
          <DialogHeader className="flex-shrink-0 border-b border-border p-4 pr-14">
            <DialogTitle className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-2">
                <MessageCircle className="h-5 w-5 text-green-400" />
                <span>
                  Chat with{" "}
                  {isDoctor
                    ? otherUser?.name || "Patient"
                    : otherUser?.name || "Doctor"}
                </span>
              </div>

              {/* Call Controls */}
              <div className="flex items-center space-x-2">
                {isDoctor ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReportOpen(true)}
                    aria-label="Open consultation report"
                    title="File the consultation report (AI parses it into a care plan)"
                    className="bg-muted hover:bg-muted"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="ml-1.5 text-xs">Report</span>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => initiateCall('audio')}
                  aria-label="Start audio call"
                  className="bg-muted hover:bg-muted"
                  disabled={callState !== 'idle' || !realtimeReady}
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => initiateCall('video')}
                  aria-label="Start video call"
                  className="bg-muted hover:bg-muted"
                  disabled={callState !== 'idle' || !realtimeReady}
                >
                  <Video className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Appointment on{" "}
              {new Date(appointment.appointmentDate).toLocaleDateString()}
              {" · "}
              {realtimeReady ? "Secure realtime connected" : "Connecting secure realtime..."}
            </DialogDescription>
          </DialogHeader>

          {rtcNotice ? (
            <div className="border-b border-amber-300/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong className="font-semibold">Calls unavailable in this browser context.</strong>
              <span className="ml-1">{rtcNotice}</span>
            </div>
          ) : null}

          {/* Call Status */}
          {(callState === "initiating" || callState === "calling") && (
            <div className="flex items-center justify-between bg-cyan-500/10 border-b border-cyan-300/20 px-4 py-3 text-sm text-cyan-100">
              <span>{callState === "initiating" ? "Preparing secure call..." : "Calling — waiting for answer..."}</span>
              {callState === "calling" && (
                <button
                  type="button"
                  onClick={cancelOutgoingCall}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-semibold hover:bg-white/10"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full w-full">
                <div className="p-4">
                  {loading ? (
                    <div className="flex items-center justify-center h-full min-h-[300px]">
                      <div className="text-muted-foreground">Loading chat...</div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full min-h-[300px] text-center">
                      <div className="space-y-2">
                        <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">No messages yet</p>
                        <p className="text-sm text-muted-foreground">
                          Start the conversation!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message, index) => renderMessage(message, index))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Image Preview Area */}
            {previewUrl && (
              <div className="flex-shrink-0 border-t border-border p-4 bg-muted">
                <div className="flex items-start space-x-3">
                  <div className="relative">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-20 h-20 object-cover rounded"
                    />
                    <button
                      onClick={handleCancelImageUpload}
                      className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1 hover:bg-green-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-zinc-300">Ready to send image</p>
                    <div className="flex space-x-2">
                      <Button
                        onClick={handleImageUpload}
                        disabled={uploading}
                        className="bg-green-600 hover:bg-green-700"
                        size="sm"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          'Send Image'
                        )}
                      </Button>
                      <Button
                        onClick={handleCancelImageUpload}
                        variant="outline"
                        size="sm"
                        className="bg-muted hover:bg-zinc-600"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="flex-shrink-0 border-t border-border p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-muted hover:bg-muted"
                  disabled={loading || uploading || !!selectedImage || callState !== 'idle'}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>

                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-muted border-border text-white placeholder-zinc-500 focus:border-green-400 focus:ring-green-400"
                  disabled={loading || sending || !!selectedImage || callState !== 'idle'}
                />

                <Button
                  type="submit"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={!newMessage.trim() || loading || sending || !!selectedImage || callState !== 'idle'}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Incoming Call Modal */}
      {incomingCall && (
        <Dialog open={true}>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-white text-center flex items-center justify-center space-x-2">
                <PhoneIncoming className="h-6 w-6 text-green-500" />
                <span>Incoming {incomingCall.callType} call</span>
              </DialogTitle>
              <DialogDescription className="text-center text-muted-foreground">
                From {incomingCall.initiatorName}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center space-x-4 mt-4">
              <Button
                onClick={acceptCall}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Accept
              </Button>
              <Button
                onClick={declineCall}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Decline
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isDoctor ? (
        <DoctorReportDialog
          appointment={appointment}
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </>
  );
}
