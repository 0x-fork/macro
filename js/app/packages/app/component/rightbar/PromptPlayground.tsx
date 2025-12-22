import { useIsAuthenticated } from '@core/auth';
import type {
    Attachment,
    ChatMessageWithAttachments,
    CreateAndSend,
    MessageStream,
    Model,
    Send,
} from '@core/component/AI/types';
import { useChatMarkdownArea } from '@core/component/AI/component/input/useChatMarkdownArea';
import { Resize } from '@core/component/Resize';
import { setPromptOverride } from '@core/component/AI/signal/promptOverride';
import { parseModel } from '@core/component/AI/util';
import {
    getChatInputStoredState,
    storeChatState,
} from '@core/component/AI/util/storage';
import { usePaywallState } from '@core/constant/PaywallState';
import { isErr } from '@core/util/maybeResult';
import { invalidateUserQuota } from '@service-auth/userQuota';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { createCognitionWebsocketEffect } from '@service-cognition/websocket';
import { refetchHistory } from '@service-storage/history';
import {
    createEffect,
    createSignal,
    on,
    onCleanup,
    Show,
    useContext,
} from 'solid-js';
import { SplitPanelContext } from '../split-layout/context';
import { Rightbar } from './Rightbar';

type ChatData = {
    messages: ChatMessageWithAttachments[];
    name: string | undefined;
    model: Model | undefined;
    attachments: Attachment[];
};

const getChatData = async (chatId: string): Promise<ChatData> => {
    if (!chatId)
        return { messages: [], name: undefined, model: undefined, attachments: [] };

    const res = await cognitionApiServiceClient.getChat({ chat_id: chatId });
    if (isErr(res, 'UNAUTHORIZED')) {
        throw new Error('Unauthorized to fetch chat');
    }
    if (isErr(res)) {
        throw new Error('Failed to fetch chat');
    }

    const [, chat] = res;
    const messages = chat.chat.messages;
    const name = chat.chat.name;

    const { model: localModel, attachments: localAttachments } =
        getChatInputStoredState(chatId);

    const model = localModel ?? parseModel(chat.chat.model);

    const attachments =
        localAttachments ??
        new Map(chat.chat.attachments.map((a) => [a.attachmentId, a]))
            .values()
            .toArray();

    return { messages, name, model, attachments };
};

export default function PromptPlayground() {
    const splitPanel = useContext(SplitPanelContext);
    const isAuthenticated = useIsAuthenticated();
    const { showPaywall } = usePaywallState();

    const [promptDraft, setPromptDraft] = createSignal<string>(
        [
            'You are Macro’s assistant.',
            '',
            '- Be concise.',
            '- Ask clarifying questions when needed.',
            '- Prefer actionable outputs.',
        ].join('\n')
    );

    const promptMarkdown = useChatMarkdownArea({
        initialValue: promptDraft(),
        addAttachment: (_a: Attachment) => { },
    });

    // Keep the global override in sync while this playground is mounted.
    // This is read by `useBuildChatSendRequest()` and attached to requests.
    createEffect(() => {
        setPromptOverride(promptDraft());
    });
    onCleanup(() => {
        setPromptOverride(undefined);
    });

    // mirrored state from Rightbar's internal useChatInput
    const [text, setText] = createSignal<string>();
    const [model, setModel] = createSignal<Model | undefined>();
    const [attachments, setAttachments] = createSignal<Attachment[]>([]);

    // chat/session state
    const [chatName, setChatName] = createSignal<string | undefined>();
    const [chatId, setChatId] = createSignal<string | undefined>();
    const [newChatId, setNewChatId] = createSignal<string | undefined>();
    const [messages, setMessages] = createSignal<ChatMessageWithAttachments[]>([]);
    const [stream, setStream] = createSignal<MessageStream>();
    const [initialChatState, setInitialChatState] = createSignal<
        | {
            model: Model | undefined;
            attachments: Attachment[];
            text: string | undefined;
        }
        | undefined
    >();

    const clearChatState = () => {
        const attached = attachments();
        setStream(undefined);
        setModel(undefined);
        setAttachments(attached);
        setText(undefined);
        setMessages([]);
        setInitialChatState({
            model: undefined,
            attachments: attached,
            text: undefined,
        });
    };

    const getChatInputState = () => {
        setInitialChatState({
            model: model(),
            attachments: attachments(),
            text: text(),
        });
    };

    const saveChatState = () => {
        const chatId_ = chatId();
        if (!chatId_) return;
        storeChatState(chatId_, {
            attachments: attachments(),
            model: model(),
        });
    };

    createEffect(
        on([chatId, attachments, model], () => {
            saveChatState();
        })
    );
    onCleanup(() => {
        saveChatState();
    });

    // Mirror RightbarWrapper's behavior so the persistent chat history list updates.
    const CHAT_RENAME_TIMEOUT_MS = 60000;
    const chatRenameMap = new Map<
        string,
        {
            callback: (name: string | undefined) => void;
            clearTimeout: () => void;
        }
    >();
    const waitChatRename = async (chatId: string) => {
        const dispose = createCognitionWebsocketEffect('chat_renamed', (data) => {
            if (data.chat_id !== chatId) return;
            const chatInfo = chatRenameMap.get(chatId);
            if (!chatInfo) return;
            chatInfo.callback(data.name);
            dispose();
        });

        return new Promise<string | undefined>((accept) => {
            setTimeout(() => {
                dispose();
                chatRenameMap.delete(chatId);
            }, CHAT_RENAME_TIMEOUT_MS);

            const errorTimeout = setTimeout(() => {
                accept(undefined);
            }, CHAT_RENAME_TIMEOUT_MS);

            chatRenameMap.set(chatId, {
                callback: accept,
                clearTimeout: () => clearTimeout(errorTimeout),
            });
        });
    };

    const onSend = async (request: Send | CreateAndSend) => {
        if (request.type === 'createAndSend') {
            const response = await request.call();
            if (response.type === 'error') {
                console.error('error creating chat', response);
                if (response.paymentError) {
                    showPaywall();
                }
                return;
            }
            const createdChatId = response.chat_id;
            setNewChatId(createdChatId);
            setChatId(createdChatId);

            refetchHistory();
            waitChatRename(createdChatId).then(() => {
                refetchHistory();
            });
            return await onSend(response);
        } else if (request.type === 'send') {
            setMessages((p) => [
                ...p,
                {
                    attachments: request.request.attachments ?? [],
                    content: request.request.content,
                    role: 'user',
                    id: '',
                },
            ]);

            const s = request.call();
            setStream(s);
            invalidateUserQuota();
        } else {
            console.error('Invalid send request', request);
        }
    };

    // load chat state when switching threads
    createEffect(
        on(chatId, (chatId_) => {
            if (!chatId_) {
                clearChatState();
                return;
            }

            if (chatId_ === newChatId()) {
                setInitialChatState({
                    model: model(),
                    attachments: attachments(),
                    text: text(),
                });
                setNewChatId(undefined);
                return;
            }

            clearChatState();
            getChatData(chatId_)
                .then(({ messages, name, model, attachments }) => {
                    setChatName(name);
                    setMessages(messages);
                    setModel(model);
                    setAttachments(attachments);
                    setInitialChatState({
                        model,
                        attachments,
                        text: undefined,
                    });
                })
                .catch((e) => {
                    console.error('Failed to load chat messages', e);
                });
        })
    );

    const onClose = () => {
        // Prefer closing the current split if we are inside a split panel.
        splitPanel?.handle.close();
    };

    const onToggleSpotlight = () => {
        splitPanel?.handle.toggleSpotlight();
    };

    const isSpotlight = () => splitPanel?.handle.isSpotLight() ?? false;

    // Nice-to-have: give the tab a stable display name.
    createEffect(() => {
        splitPanel?.handle.setDisplayName('Prompt Playground');
    });

    return (
        <div class="relative flex flex-col justify-between w-full h-full">
            {/* Match the way the app mounts resizable panels in `Layout.tsx` */}
            <div class="p-[var(--gutter-size)] grow-1">
                <Resize.Zone
                    id="prompt-playground"
                    gutter={8}
                    direction="horizontal"
                    class="flex-1 w-full min-h-0 font-sans text-ink caret-accent"
                >
                    <Resize.Panel id="prompt-playground-chat" minSize={440}>
                        <div class="size-full min-h-0 overflow-hidden">
                            <Show
                                when={isAuthenticated()}
                                fallback={
                                    <div class="p-3 text-white font-mono text-sm bg-red-700">
                                        Prompt Playground is mounted, but you are not authenticated (chat UI hidden).
                                    </div>
                                }
                            >
                                <Rightbar
                                    showTopBar={false}
                                    chatId={chatId()}
                                    chatName={chatName()}
                                    messages={messages}
                                    onUnmount={getChatInputState}
                                    initialState={initialChatState()}
                                    onSend={onSend}
                                    stream={stream}
                                    setState={{
                                        setChatId,
                                        setModel,
                                        setAttachments,
                                        setText,
                                        setMessages,
                                        setStream,
                                    }}
                                />
                            </Show>
                        </div>
                    </Resize.Panel>

                    <Resize.Panel
                        id="prompt-playground-prompt"
                        minSize={360}
                        maxSize={900}
                    >
                        <div class="size-full min-h-0 overflow-hidden flex flex-col bg-panel">
                            <div class="shrink-0 h-10 px-3 flex items-center justify-between border-b border-edge-muted">
                                <div class="text-sm font-semibold">Prompt</div>
                                <div class="text-xs text-ink-muted">markdown</div>
                            </div>
                            <div class="flex-1 min-h-0 p-3 overflow-hidden">
                                <div class="h-full w-full border border-edge-muted bg-surface overflow-hidden">
                                    <div class="h-full w-full overflow-auto px-3 py-2 text-ink">
                                        <promptMarkdown.MarkdownArea
                                            placeholder="Write a prompt here…"
                                            dontFocusOnMount={true}
                                            onChange={(value) => setPromptDraft(value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Resize.Panel>
                </Resize.Zone>
            </div>
        </div>
    );
}


