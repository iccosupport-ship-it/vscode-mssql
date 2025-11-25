/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

import { ActivityStatus, TelemetryActions, TelemetryViews } from "../sharedInterfaces/telemetry";
import {
    ColorThemeChangeNotification,
    ExecuteCommandParams,
    ExecuteCommandRequest,
    GetEOLRequest,
    GetKeyBindingsConfigRequest,
    GetLocalizationRequest,
    GetPlatformRequest,
    GetStateRequest,
    GetThemeRequest,
    KeyBindingsChangeNotification,
    LoadStatsNotification,
    LogEvent,
    LogNotification,
    ReducerRequest,
    SendActionEventNotification,
    SendErrorEventNotification,
    StateChangeNotification,
    WebviewRpcMessage,
    WebviewTelemetryActionEvent,
    WebviewTelemetryErrorEvent,
} from "../sharedInterfaces/webview";
import { sendActionEvent, sendErrorEvent, startActivity } from "../telemetry/telemetry";

import { getEditorEOL, getNonce } from "../utils/utils";
import { Logger } from "../models/logger";
import VscodeWrapper from "./vscodeWrapper";
import {
    AbstractMessageReader,
    AbstractMessageWriter,
    CancellationToken,
    createMessageConnection,
    DataCallback,
    Disposable,
    Emitter,
    Message,
    MessageConnection,
    MessageWriter,
    NotificationType,
    RequestHandler,
    RequestType,
} from "vscode-jsonrpc/node";
import { MessageReader } from "vscode-languageclient";
import { Deferred } from "../protocol";
import * as Constants from "../constants/constants";

class WebviewControllerMessageReader extends AbstractMessageReader implements MessageReader {
    private _onData: Emitter<Message>;
    private _disposables: vscode.Disposable[] = [];
    private _webview: vscode.Webview;
    constructor(private logger: Logger) {
        super();
        this._onData = new Emitter<Message>();
    }

    updateWebview(webview: vscode.Webview) {
        // Clean up existing disposables
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];

        this._webview = webview;

        if (webview) {
            const disposable = this._webview.onDidReceiveMessage((event) => {
                const { method, error } = event as any;
                this.logger.verbose(`Message received from webview: ${method}`);
                sendActionEvent(
                    TelemetryViews.WebviewController,
                    TelemetryActions.ReceivedFromWebview,
                    {
                        messageType: method ? "request" : "response",
                        type: method,
                        isError: error ? "true" : "false",
                    },
                );

                this._onData.fire(event);
            });
            this._disposables.push(disposable);
        }
    }

    listen(callback: DataCallback): Disposable {
        return this._onData.event(callback);
    }

    dispose() {
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
        this._onData.dispose();
    }
}

class WebviewControllerMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private _webview: vscode.Webview;
    private _writeQueue: Promise<void> = Promise.resolve();
    constructor(private logger: Logger) {
        super();
    }
    updateWebview(webview: vscode.Webview) {
        this._webview = webview;
    }
    write(msg: Message): Promise<void> {
        if (!this._webview) {
            return Promise.resolve();
        }

        const { method, error } = msg as any;
        this.logger.verbose(`Sending message to webview: ${method}`);
        sendActionEvent(TelemetryViews.WebviewController, TelemetryActions.SentToWebview, {
            messageType: method ? "request" : "response",
            type: method,
            isError: error ? "true" : "false",
        });

        this._writeQueue = this._writeQueue
            .catch(() => undefined)
            .then(() => this.postMessageWithTimeout(msg, method));

        return this._writeQueue;
    }

    private async postMessageWithTimeout(msg: Message, method?: string): Promise<void> {
        const label = method ?? "response";
        if (!this._webview) {
            return;
        }

        const sendPromise = Promise.resolve(this._webview.postMessage(msg));
        try {
            const result = await withPostMessageTimeout(sendPromise, label);
            if (result === false) {
                throw new Error(`postMessage returned false for '${label}'`);
            }
        } catch (err) {
            throw err;
        }
    }
    end(): void {}
}

function withPostMessageTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timed out sending '${label}' to webview`));
        }, 30000);

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/**
 * ReactWebviewBaseController is a class that manages a vscode.Webview and provides
 * a way to communicate with it. It provides a way to register request handlers and reducers
 * that can be called from the webview. It also provides a way to post notifications to the webview.
 * @template State The type of the state object that the webview will use
 * @template Reducers The type of the reducers that the webview will use
 */
export abstract class ReactWebviewBaseController<State, Reducers> implements vscode.Disposable {
    private _disposables: vscode.Disposable[] = [];
    private _isDisposed: boolean = false;
    private _onDisposed: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDisposed: vscode.Event<void> = this._onDisposed.event;

    /**
     * A one-time promise that resolves when the webview is ready to receive messages.
     */
    private _webviewReady: Deferred<void> = new Deferred<void>();
    private _webviewReadyResolved: boolean = false;

    private _state: State;
    private _isFirstLoad: boolean = true;
    protected _loadStartTime: number = Date.now();
    private _endLoadActivity = startActivity(
        TelemetryViews.WebviewController,
        TelemetryActions.Load,
    );

    public connection: MessageConnection;
    private _connectionReader: WebviewControllerMessageReader;
    private _connectionWriter: WebviewControllerMessageWriter;
    private _reducerHandlers = new Map<
        keyof Reducers,
        (state: State, payload: Reducers[keyof Reducers]) => ReducerResponse<State>
    >();
    private _currentWebview: vscode.Webview | undefined;

    protected logger: Logger;

    /**
     * Creates a new ReactWebviewPanelController
     * @param _context The context of the extension
     * @param _sourceFile The source file that the webview will use
     * @param _initialData The initial state object that the webview will use
     */
    constructor(
        protected _context: vscode.ExtensionContext,
        protected vscodeWrapper: VscodeWrapper,
        private _sourceFile: string,
        private _initialData: State,
        viewId?: string,
    ) {
        if (!vscodeWrapper) {
            vscodeWrapper = new VscodeWrapper();
        }

        this.logger = Logger.create(vscodeWrapper.outputChannel, viewId);

        this._connectionReader = new WebviewControllerMessageReader(this.logger);
        this._connectionWriter = new WebviewControllerMessageWriter(this.logger);
        this.connection = createMessageConnection(this._connectionReader, this._connectionWriter);
        this.connection.listen();

        // Add connection to disposables for cleanup
        this._disposables.push({
            dispose: () => {
                this.connection.dispose();
                this._connectionReader.dispose();
                this._connectionWriter.dispose();
            },
        });
    }

    /**
     * Updates the webview used by JSON RPC connection.
     * This method should be called whenever the webview is recreated or updated.
     * @param webview
     */
    protected updateConnectionWebview(webview: vscode.Webview) {
        if (webview && this._currentWebview !== webview) {
            this._currentWebview = webview;
            this.resetWebviewReadyState();
        }

        if (webview) {
            this._connectionReader.updateWebview(webview);
            this._connectionWriter.updateWebview(webview);
        }
    }

    protected initializeBase() {
        if (!this.state) {
            this.state = this._initialData;
        }
        this._registerDefaultRequestHandlers();
        this.setupTheming();
        this.setupKeyBindings();
    }

    protected registerDisposable(disposable: vscode.Disposable) {
        this._disposables.push(disposable);
    }

    protected _getHtmlTemplate() {
        const nonce = getNonce();

        const baseUrl = this._getWebview().asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "dist", "views"),
        );
        const baseUrlString = baseUrl.toString() + "/";

        return `
		<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>mssqlwebview</title>
					<base href="${baseUrlString}"> <!-- Required for loading relative resources in the webview -->
				<style>
					html, body {
						margin: 0;
						padding: 0px;
  						width: 100%;
  						height: 100%;
					}
				</style>
				</head>
				<body>
					<link rel="stylesheet" href="${this._sourceFile}.css">
					<div id="root"></div>
				  	<script type="module" nonce="${nonce}" src="${this._sourceFile}.js"></script> <!-- since our bundles are in esm format we need to use type="module" -->
				</body>
			</html>
		`;
    }

    protected abstract _getWebview(): vscode.Webview;

    protected setupTheming() {
        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme((theme) => {
                void this.sendNotification(ColorThemeChangeNotification.type, theme.kind);
            }),
        );
        void this.sendNotification(
            ColorThemeChangeNotification.type,
            vscode.window.activeColorTheme.kind,
        );
    }

    protected setupKeyBindings() {
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration(Constants.configShortcuts)) {
                    void this.sendNotification(
                        KeyBindingsChangeNotification.type,
                        this.readKeyBindingsConfig(),
                    );
                }
            }),
        );
        void this.sendNotification(
            KeyBindingsChangeNotification.type,
            this.readKeyBindingsConfig(),
        );
    }

    private resolveWebviewReady() {
        if (this._webviewReadyResolved) {
            return;
        }

        this._webviewReadyResolved = true;
        this._webviewReady.resolve();
    }

    private resetWebviewReadyState() {
        this._webviewReady = new Deferred<void>();
        this._webviewReadyResolved = false;
        this._loadStartTime = Date.now();
    }

    private _registerDefaultRequestHandlers() {
        this.onNotification(
            SendActionEventNotification.type,
            (message: WebviewTelemetryActionEvent) => {
                sendActionEvent(
                    message.telemetryView,
                    message.telemetryAction,
                    message.additionalProps,
                    message.additionalMeasurements,
                );
            },
        );

        this.onNotification(
            SendErrorEventNotification.type,
            (message: WebviewTelemetryErrorEvent) => {
                sendErrorEvent(
                    message.telemetryView,
                    message.telemetryAction,
                    message.error,
                    message.includeErrorMessage,
                    message.errorCode,
                    message.errorType,
                    message.additionalProps,
                    message.additionalMeasurements,
                );
            },
        );

        this.onNotification(LogNotification.type, async (message: LogEvent) => {
            this.logger[message.level ?? "log"](message.message);
        });

        this.onNotification(LoadStatsNotification.type, (message) => {
            const timeStamp = message.loadCompleteTimeStamp;
            const timeToLoad = timeStamp - this._loadStartTime;

            /**
             * This notification is sent from the webview when it has finished loading. We use
             * this to track when the webview is ready to receive messages.
             */
            this.resolveWebviewReady();

            if (this._isFirstLoad) {
                console.log(
                    `Load stats for ${this._sourceFile}` + "\n" + `Total time: ${timeToLoad} ms`,
                );
                this._endLoadActivity.end(ActivityStatus.Succeeded, {
                    type: this._sourceFile,
                });
                this._isFirstLoad = false;
            }
        });

        this.onRequest(GetStateRequest.type<State>(), () => {
            return this.state;
        });

        this.onRequest(GetThemeRequest.type, () => {
            return vscode.window.activeColorTheme.kind;
        });

        this.onRequest(GetKeyBindingsConfigRequest.type, () => {
            return this.readKeyBindingsConfig();
        });

        this.onRequest(GetLocalizationRequest.type, async () => {
            if (vscode.l10n.uri?.fsPath) {
                const file = await vscode.workspace.fs.readFile(vscode.l10n.uri);
                const fileContents = Buffer.from(file).toString();
                return fileContents;
            } else {
                return undefined;
            }
        });

        this.onRequest(ExecuteCommandRequest.type, async (params: ExecuteCommandParams) => {
            if (!params?.command) {
                this.logger.log("No command provided to execute");
                return;
            }
            const args = params?.args ?? [];
            return await vscode.commands.executeCommand(params.command, ...args);
        });

        this.onRequest(GetPlatformRequest.type, async () => {
            return process.platform;
        });

        this.onRequest(ReducerRequest.type<Reducers>(), async (action) => {
            const reducerActivity = startActivity(
                TelemetryViews.WebviewController,
                TelemetryActions.Reducer,
                undefined,
                {
                    type: action.type as string,
                },
            );
            const reducer = this._reducerHandlers.get(action.type);
            if (reducer) {
                try {
                    this.state = await reducer(this.state, action.payload);
                    reducerActivity.end(ActivityStatus.Succeeded);
                } catch (error) {
                    reducerActivity.endFailed(error, false);
                    throw error;
                }
            } else {
                reducerActivity.endFailed(
                    new Error(`No reducer registered for action ${action.type as string}`),
                    false,
                );
                throw new Error(`No reducer registered for action ${action.type as string}`);
            }
        });

        this.onRequest(GetEOLRequest.type, () => {
            return getEditorEOL();
        });
    }

    /**
     * Reducers are methods that can be called from the webview to modify the state of the webview.
     * This method registers a reducer that can be called from the webview.
     * @param method The method name that the webview will use to call the reducer
     * @param reducer The reducer that will be called when the method is called
     * @template Method The key of the reducer that is being registered
     */
    public registerReducer<Method extends keyof Reducers>(
        method: Method,
        reducer: (state: State, payload: Reducers[Method]) => ReducerResponse<State>,
    ) {
        this._reducerHandlers.set(method, reducer);
    }

    /**
     * Registers a request handler for a specific request type.
     * @param type The request type that the handler will handle
     * @param handler The handler that will be called when the request is made
     */
    public onRequest<TParam, TResult, TError>(
        type: RequestType<TParam, TResult, TError>,
        handler: RequestHandler<TParam, TResult, TError>,
    ): void {
        if (!this.connection) {
            return;
        }
        if (this._isDisposed) {
            throw new Error("Cannot register request handler on disposed controller");
        }
        this.connection.onRequest(type, (params, token) => {
            try {
                const result = handler(params, token);
                if (result instanceof Promise) {
                    return result.then(
                        (value) => {
                            return value;
                        },
                        (error) => {
                            throw error;
                        },
                    );
                }

                return result;
            } catch (error) {
                throw error;
            }
        });
    }

    /**
     * Registers a reducer that can be called from the webview.
     */
    public async sendRequest<TParam, TResult, TError>(
        type: RequestType<TParam, TResult, TError>,
        params: TParam,
        token?: CancellationToken,
    ): Promise<TResult> {
        if (!this.connection) {
            return Promise.reject(new Error("Cannot send request without a live connection"));
        }
        if (this._isDisposed) {
            return Promise.reject(new Error("Cannot send request on disposed controller"));
        }

        await this.whenWebviewReady();
        try {
            const result = await this.connection.sendRequest(type, params, token);
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Sends a notification to the webview. This is used to notify the webview of changes
     * @param type The notification type that the webview will handle
     * @param params The parameters that will be passed to the notification handler
     */
    public async sendNotification<TParams>(
        type: NotificationType<TParams>,
        params: TParams,
    ): Promise<void> {
        if (!this.connection) {
            return Promise.resolve();
        }
        if (this._isDisposed) {
            throw new Error("Cannot send notification on disposed controller");
        }
        await this.whenWebviewReady();
        try {
            await this.connection.sendNotification(type, params);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Registers a notification handler for a specific notification type.
     * This handler will be called when the webview sends a notification of that type.
     * @param type The notification type that the handler will handle
     * @param handler The handler that will be called when the notification is received
     */
    public onNotification<TParams>(
        type: NotificationType<TParams>,
        handler: (params: TParams) => void,
    ): void {
        if (!this.connection) {
            return;
        }
        if (this._isDisposed) {
            throw new Error("Cannot register notification handler on disposed controller");
        }
        this.connection.onNotification(type, handler);
    }

    /**
     * Gets the state object that the webview is using
     */
    public get state(): State {
        return this._state;
    }

    /**
     * Sets the state object that the webview is using. This will update the state in the webview
     * and may cause the webview to re-render.
     * @param value The new state object
     */
    public set state(value: State) {
        this._state = value;
        void this.sendNotification(StateChangeNotification.type<State>(), value);
    }

    /**
     * Updates the state in the webview
     * @param state The new state object.  If not provided, `this.state` is used.
     */
    public updateState(state?: State) {
        this.state = state ?? this.state;
    }

    /**
     * Gets whether the controller has been disposed
     */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Posts a message to the webview
     * @param message The message to post to the webview
     */
    public postMessage(message: WebviewRpcMessage) {
        if (!this._isDisposed) {
            this._getWebview()?.postMessage(message);
        }
    }

    /**
     * Disposes the controller
     */
    public dispose() {
        this._onDisposed.fire();
        this._disposables.forEach((d) => d.dispose());
        this._isDisposed = true;
    }

    /**
     * Returns a promise that resolves when the webview has finished its initial load
     * and is ready to receive JSON-RPC requests/notifications. Use this before sending
     * any messages that require the webview script side to be active.
     * Typical usage:
     * ```typescript
     * await controller.whenWebviewReady();
     * await controller.sendRequest(...); // safe to send requests now
     * ```
     * @returns
     */
    public whenWebviewReady(): Promise<void> {
        if (this._webviewReadyResolved) {
            return Promise.resolve();
        }
        return this._webviewReady.promise;
    }

    private readKeyBindingsConfig(): Record<string, string> {
        return (
            vscode.workspace
                .getConfiguration()
                ?.get<Record<string, string>>(Constants.configShortcuts) ?? {}
        );
    }
}

export type ReducerResponse<T> = T | Promise<T>;
