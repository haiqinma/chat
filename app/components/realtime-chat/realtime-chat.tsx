import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";
import PowerIcon from "@/app/icons/power.svg";

import styles from "./realtime-chat.module.scss";
import clsx from "clsx";

import { useState, useRef, useEffect } from "react";

import {
  DEFAULT_OPENAI_REALTIME_MODEL,
  createMessage,
  isRouterRealtimeProvider,
  useAccessStore,
  useChatStore,
} from "@/app/store";

import { IconButton } from "@/app/components/button";

import { RTClient, RTInputAudioItem, RTResponse } from "rt-client";
import { AudioHandler } from "@/app/lib/audio";
import { uploadImage } from "@/app/utils/chat";
import { VoicePrint } from "@/app/components/voice-print";
import {
  RouterRealtimeClient,
  RouterRealtimeInputAudioItem,
  RouterRealtimeResponse,
  createRouterSessionParams,
} from "./router-realtime-client";
import { ServiceProvider } from "@/app/constant";
import { getClientConfig } from "@/app/config/client";

type RealtimeClient = RTClient | RouterRealtimeClient;
type RealtimeResponse = RTResponse | RouterRealtimeResponse;
type InputAudioItem = RTInputAudioItem | RouterRealtimeInputAudioItem;

function resolveRouterEndpoint(endpointOverride?: string) {
  const accessStore = useAccessStore.getState();
  return (
    endpointOverride?.trim() ||
    accessStore.openaiUrl?.trim() ||
    getClientConfig()?.routerBackendUrl?.trim() ||
    "https://llm.yeying.pub"
  );
}

function resolveRouterToken(tokenOverride?: string) {
  const accessStore = useAccessStore.getState();
  const override = tokenOverride?.trim();
  if (override) return override;

  const selectedToken = accessStore.selectedRouterToken?.trim();
  if (selectedToken) return selectedToken;

  const apiKey = accessStore.openaiApiKey?.trim();
  if (apiKey) return apiKey;

  return "";
}

interface RealtimeChatProps {
  onClose?: () => void;
  onStartVoice?: () => void;
  onPausedVoice?: () => void;
}

export function RealtimeChat({
  onClose,
  onStartVoice,
  onPausedVoice,
}: RealtimeChatProps) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const realtimeConfig = session.skill.realtimeConfig;
  const [status, setStatus] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [modality, setModality] = useState("audio");
  const [useVAD, setUseVAD] = useState(true);
  const [frequencies, setFrequencies] = useState<Uint8Array | undefined>();

  const clientRef = useRef<RealtimeClient | null>(null);
  const audioHandlerRef = useRef<AudioHandler | null>(null);
  const initRef = useRef(false);
  const handleConnectRef = useRef<() => Promise<boolean>>(async () => false);
  const toggleRecordingRef = useRef<() => Promise<void>>(async () => {});
  const disconnectRef = useRef<() => Promise<void>>(async () => {});
  const isRecordingRef = useRef(false);

  const temperature = realtimeConfig?.temperature ?? 0.9;
  const apiKey = realtimeConfig?.apiKey ?? "";
  const model = realtimeConfig?.model ?? DEFAULT_OPENAI_REALTIME_MODEL;
  const router = isRouterRealtimeProvider(realtimeConfig?.provider);
  const azure = realtimeConfig?.provider === ServiceProvider.Azure;
  const azureEndpoint = realtimeConfig?.azure.endpoint ?? "";
  const azureDeployment = realtimeConfig?.azure.deployment ?? "";
  const voice = realtimeConfig?.voice ?? "alloy";

  const handleConnect = async () => {
    if (isConnecting) return false;
    if (!isConnected) {
      try {
        setIsConnecting(true);
        if (router) {
          const token = resolveRouterToken(apiKey);
          if (!token) {
            throw new Error("Missing Router realtime token");
          }
          clientRef.current = new RouterRealtimeClient({
            endpoint: resolveRouterEndpoint(realtimeConfig?.router?.endpoint),
            token,
            model,
          });
        } else if (azure) {
          clientRef.current = new RTClient(
            new URL(azureEndpoint),
            { key: apiKey },
            { deployment: azureDeployment },
          );
        } else {
          clientRef.current = new RTClient({ key: apiKey }, { model });
        }

        await clientRef.current.configure(
          createRouterSessionParams({
            voice,
            temperature,
            modality,
            useVAD,
          }) as any,
        );
        startResponseListener();

        setIsConnected(true);
        // TODO
        // try {
        //   const recentMessages = chatStore.getMessagesWithMemory();
        //   for (const message of recentMessages) {
        //     const { role, content } = message;
        //     if (typeof content === "string") {
        //       await clientRef.current.sendItem({
        //         type: "message",
        //         role: role as any,
        //         content: [
        //           {
        //             type: (role === "assistant" ? "text" : "input_text") as any,
        //             text: content as string,
        //           },
        //         ],
        //       });
        //     }
        //   }
        //   // await clientRef.current.generateResponse();
        // } catch (error) {
        //   console.error("Set message failed:", error);
        // }
        return true;
      } catch (error) {
        console.error("Connection failed:", error);
        clientRef.current = null;
        setIsConnected(false);
        setStatus("Connection failed");
        return false;
      } finally {
        setIsConnecting(false);
      }
    } else {
      await disconnect();
      return false;
    }
  };

  const disconnect = async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.close();
        clientRef.current = null;
        setIsConnected(false);
      } catch (error) {
        console.error("Disconnect failed:", error);
      }
    }
  };

  const startResponseListener = async () => {
    if (!clientRef.current) return;

    try {
      for await (const serverEvent of clientRef.current.events()) {
        if (serverEvent.type === "response") {
          await handleResponse(serverEvent);
        } else if (serverEvent.type === "input_audio") {
          await handleInputAudio(serverEvent);
        }
      }
    } catch (error) {
      if (clientRef.current) {
        console.error("Response iteration error:", error);
      }
    }
  };

  const handleResponse = async (response: RealtimeResponse) => {
    for await (const item of response) {
      if (item.type === "message" && item.role === "assistant") {
        const botMessage = createMessage({
          role: item.role,
          content: "",
        });
        // add bot message first
        chatStore.updateTargetSession(session, (session) => {
          session.messages = session.messages.concat([botMessage]);
        });
        let hasAudio = false;
        for await (const content of item) {
          if (content.type === "text") {
            for await (const text of content.textChunks()) {
              botMessage.content += text;
            }
          } else if (content.type === "audio") {
            const textTask = async () => {
              for await (const text of content.transcriptChunks()) {
                botMessage.content += text;
              }
            };
            const audioTask = async () => {
              audioHandlerRef.current?.startStreamingPlayback();
              for await (const audio of content.audioChunks()) {
                hasAudio = true;
                audioHandlerRef.current?.playChunk(audio);
              }
            };
            await Promise.all([textTask(), audioTask()]);
          }
          // update message.content
          chatStore.updateTargetSession(session, (session) => {
            session.messages = session.messages.concat();
          });
        }
        if (hasAudio) {
          // upload audio get audio_url
          const blob = audioHandlerRef.current?.savePlayFile();
          uploadImage(blob!).then((audio_url) => {
            botMessage.audio_url = audio_url;
            // update text and audio_url
            chatStore.updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          });
        }
      }
    }
  };

  const handleInputAudio = async (item: InputAudioItem) => {
    await item.waitForCompletion();
    if (item.transcription) {
      const userMessage = createMessage({
        role: "user",
        content: item.transcription,
      });
      chatStore.updateTargetSession(session, (session) => {
        session.messages = session.messages.concat([userMessage]);
      });
      // save input audio_url, and update session
      const { audioStartMillis, audioEndMillis } = item;
      // upload audio get audio_url
      const blob = audioHandlerRef.current?.saveRecordFile(
        audioStartMillis,
        audioEndMillis,
      );
      uploadImage(blob!).then((audio_url) => {
        userMessage.audio_url = audio_url;
        chatStore.updateTargetSession(session, (session) => {
          session.messages = session.messages.concat();
        });
      });
    }
    // stop streaming play after get input audio.
    audioHandlerRef.current?.stopStreamingPlayback();
  };

  const toggleRecording = async () => {
    if (!isRecording && clientRef.current) {
      try {
        if (!audioHandlerRef.current) {
          audioHandlerRef.current = new AudioHandler();
          await audioHandlerRef.current.initialize();
        }
        await audioHandlerRef.current.startRecording(async (chunk) => {
          await clientRef.current?.sendAudio(chunk);
        });
        setIsRecording(true);
      } catch (error) {
        console.error("Failed to start recording:", error);
      }
    } else if (audioHandlerRef.current) {
      try {
        audioHandlerRef.current.stopRecording();
        if (!useVAD) {
          const inputAudio = await clientRef.current?.commitAudio();
          await handleInputAudio(inputAudio!);
          await clientRef.current?.generateResponse();
        }
        setIsRecording(false);
      } catch (error) {
        console.error("Failed to stop recording:", error);
      }
    }
  };

  handleConnectRef.current = handleConnect;
  toggleRecordingRef.current = toggleRecording;
  disconnectRef.current = disconnect;
  isRecordingRef.current = isRecording;

  useEffect(() => {
    // 防止重复初始化
    if (initRef.current) return;
    initRef.current = true;

    const initAudioHandler = async () => {
      const handler = new AudioHandler();
      await handler.initialize();
      audioHandlerRef.current = handler;
      const connected = await handleConnectRef.current();
      if (connected) {
        await toggleRecordingRef.current();
      }
    };

    initAudioHandler().catch((error) => {
      setStatus(error);
      console.error(error);
    });

    return () => {
      if (isRecordingRef.current) {
        toggleRecordingRef.current();
      }
      audioHandlerRef.current?.close().catch(console.error);
      disconnectRef.current();
    };
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    if (isConnected && isRecording) {
      const animationFrame = () => {
        if (audioHandlerRef.current) {
          const freqData = audioHandlerRef.current.getByteFrequencyData();
          setFrequencies(freqData);
        }
        animationFrameId = requestAnimationFrame(animationFrame);
      };

      animationFrameId = requestAnimationFrame(animationFrame);
    } else {
      setFrequencies(undefined);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isConnected, isRecording]);

  // update session params
  useEffect(() => {
    clientRef.current?.configure({ voice: voice as any });
  }, [voice]);
  useEffect(() => {
    clientRef.current?.configure({ temperature });
  }, [temperature]);

  const handleClose = async () => {
    onClose?.();
    if (isRecording) {
      await toggleRecording();
    }
    disconnect().catch(console.error);
  };

  return (
    <div className={styles["realtime-chat"]}>
      <div
        className={clsx(styles["circle-mic"], {
          [styles["pulse"]]: isRecording,
        })}
      >
        <VoicePrint frequencies={frequencies} isActive={isRecording} />
      </div>

      <div className={styles["bottom-icons"]}>
        <div>
          <IconButton
            icon={isRecording ? <VoiceIcon /> : <VoiceOffIcon />}
            onClick={toggleRecording}
            disabled={!isConnected}
            shadow
            bordered
          />
        </div>
        <div className={styles["icon-center"]}>{status}</div>
        <div>
          <IconButton
            icon={<PowerIcon />}
            onClick={handleClose}
            shadow
            bordered
          />
        </div>
      </div>
    </div>
  );
}
