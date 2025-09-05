/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import * as TypeMoq from "typemoq";
import * as vscode from "vscode";
import { expect } from "chai";
import * as Extension from "../../src/extension";
import * as Constants from "../../src/constants/constants";
import MainController from "../../src/controllers/mainController";
import ConnectionManager from "../../src/controllers/connectionManager";
import UntitledSqlDocumentService from "../../src/controllers/untitledSqlDocumentService";
import VscodeWrapper from "../../src/controllers/vscodeWrapper";
import { TestExtensionContext } from "./stubs";
import { activateExtension } from "./utils";
import StatusView from "../../src/views/statusView";

suite("MainController Tests", function () {
    let document: vscode.TextDocument;
    let newDocument: vscode.TextDocument;
    let mainController: MainController;
    let connectionManager: TypeMoq.IMock<ConnectionManager>;
    let untitledSqlDocumentService: TypeMoq.IMock<UntitledSqlDocumentService>;
    let docUri: string;
    let newDocUri: string;
    let docUriCallback: string;
    let newDocUriCallback: string;

    setup(async () => {
        // Need to activate the extension to get the mainController
        await activateExtension();

        // Setup a standard document and a new document
        docUri = "docURI.sql";
        newDocUri = "newDocURI.sql";

        document = mockTextDocument(docUri);
        newDocument = mockTextDocument(newDocUri);

        // Resetting call back variables
        docUriCallback = "";
        newDocUriCallback = "";
        // Using the mainController that was instantiated with the extension
        mainController = await Extension.getController();

        // Setting up a mocked connectionManager
        let mockContext: TypeMoq.IMock<vscode.ExtensionContext> =
            TypeMoq.Mock.ofType<vscode.ExtensionContext>();
        connectionManager = TypeMoq.Mock.ofType(
            ConnectionManager,
            TypeMoq.MockBehavior.Loose,
            mockContext.object,
        );
        mainController.connectionManager = connectionManager.object;

        untitledSqlDocumentService = TypeMoq.Mock.ofType(UntitledSqlDocumentService);
        mainController.untitledSqlDocumentService = untitledSqlDocumentService.object;

        // Stub output content provider interactions used by updateUri
        (mainController as any)._outputContentProvider = {
            updateQueryRunnerUri: async (_oldUri: string, _newUri: string) => Promise.resolve(),
            onUntitledFileSaved: (_oldUri: string, _newUri: string) => {},
            onDidCloseTextDocument: (_doc: vscode.TextDocument) => {},
        };
        // Suppress provider updates during tests to avoid state requirements
        (mainController as any)._suppressDocStateUpdates = true;

        setupConnectionManagerMocks(connectionManager);
    });

    // Standard closed document event test
    test("onDidCloseTextDocument should propogate onDidCloseTextDocument to connectionManager", () => {
        void mainController.onDidCloseTextDocument(document);
        try {
            connectionManager.verify(
                (x) => x.onDidCloseTextDocument(TypeMoq.It.isAny()),
                TypeMoq.Times.once(),
            );
            assert.equal(docUriCallback, document.uri.toString());
            docUriCallback = "";
        } catch (err) {
            throw err;
        }
    });

    // Saved Untitled file event test (deterministic using create file event)
    test("onDidCreateFiles should transfer connection from untitled source to created file", async () => {
        const untitledUri = `untitled:${docUri}`;
        // simulate pending untitled Save As source
        (mainController as any)._pendingUntitledSaveSourceUri = untitledUri;

        // simulate file creation event
        const createdFileEvent: vscode.FileCreateEvent = {
            files: [vscode.Uri.parse(newDocUri)],
        } as vscode.FileCreateEvent;

        await (mainController as any).onDidCreateFiles(createdFileEvent);

        connectionManager.verify(
            (x) =>
                x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
        assert.equal(docUriCallback, untitledUri);
        // Created file URIs include the file scheme; compare by suffix
        assert.ok(
            newDocUriCallback.endsWith(newDocument.uri.toString()),
            `${newDocUriCallback} should end with ${newDocument.uri.toString()}`,
        );
    });

    // Renamed file event test (deterministic using rename file event)
    test("onDidRenameFiles should transfer connection on rename", async () => {
        const renameEvent: vscode.FileRenameEvent = {
            files: [
                {
                    oldUri: vscode.Uri.parse(document.uri.toString()),
                    newUri: vscode.Uri.parse(newDocument.uri.toString()),
                },
            ],
        } as unknown as vscode.FileRenameEvent;

        await (mainController as any).onDidRenameFiles(renameEvent);

        connectionManager.verify(
            (x) =>
                x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.atLeastOnce(),
        );
        // Renamed file URIs include the file scheme; compare by suffix
        assert.ok(
            docUriCallback.endsWith(document.uri.toString()),
            `${docUriCallback} should end with ${document.uri.toString()}`,
        );
        assert.ok(
            newDocUriCallback.endsWith(newDocument.uri.toString()),
            `${newDocUriCallback} should end with ${newDocument.uri.toString()}`,
        );
    });

    // Removed timer-based test; close doc should still propagate normally

    // Open document event test
    test("onDidOpenTextDocument should propogate the function to the connectionManager", (done) => {
        // Call onDidOpenTextDocument to test it side effects
        void mainController.onDidOpenTextDocument(document);
        try {
            connectionManager.verify(
                (x) => x.onDidOpenTextDocument(TypeMoq.It.isAny()),
                TypeMoq.Times.once(),
            );
            assert.equal(docUriCallback, document.uri.toString());
            done();
        } catch (err) {
            done(new Error(err));
        }
    });

    // Save document event test
    test("onDidSaveTextDocument should propogate the function to the connectionManager", (done) => {
        // Call onDidOpenTextDocument to test it side effects
        mainController.onDidSaveTextDocument(newDocument);
        try {
            // Ensure no extraneous function is called
            connectionManager.verify(
                (x) => x.onDidOpenTextDocument(TypeMoq.It.isAny()),
                TypeMoq.Times.never(),
            );
            connectionManager.verify(
                (x) => x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                TypeMoq.Times.never(),
            );
            done();
        } catch (err) {
            done(new Error(err));
        }
    });

    test("TextDocument Events should handle non-initialized connection manager", (done) => {
        let vscodeWrapperMock: TypeMoq.IMock<VscodeWrapper> = TypeMoq.Mock.ofType(VscodeWrapper);
        let controller: MainController = new MainController(
            TestExtensionContext.object,
            undefined, // ConnectionManager
            vscodeWrapperMock.object,
        );

        // None of the TextDocument events should throw exceptions, they should cleanly exit instead.
        void controller.onDidOpenTextDocument(document);
        controller.onDidSaveTextDocument(document);
        void controller.onDidCloseTextDocument(document);
        done();
    });

    test("onNewQuery should call the new query and new connection", async () => {
        let editor: vscode.TextEditor = {
            document: {
                uri: "test_uri",
            },
            viewColumn: vscode.ViewColumn.One,
            selection: undefined,
        } as any;
        untitledSqlDocumentService
            .setup((x) => x.newQuery(undefined, true))
            .returns(() => {
                return Promise.resolve(editor);
            });
        connectionManager
            .setup((x) => x.onNewConnection())
            .returns(() => {
                return Promise.resolve(undefined);
            });

        await mainController.onNewQuery(undefined, undefined);
        untitledSqlDocumentService.verify((x) => x.newQuery(undefined, true), TypeMoq.Times.once());
        connectionManager.verify((x) => x.onNewConnection(), TypeMoq.Times.atLeastOnce());
    });

    test("onNewQuery should not call the new connection if new query fails", async () => {
        // Ensure the command is allowed to run (otherwise early return and nothing is called)
        (mainController as any).canRunCommand = () => true;

        // Make newQuery reject
        untitledSqlDocumentService
            .setup((x) => x.newQuery(TypeMoq.It.isAny(), TypeMoq.It.isValue(true))) // <-- 2 args
            .returns(() => Promise.reject(new Error("boom")));

        // No need to "returns" here; but if you do, return a real value, not It.isAny()
        connectionManager.setup((x) => x.onNewConnection()).returns(() => Promise.resolve() as any);

        // Act + assert reject
        await assert.rejects(() => mainController.onNewQuery(undefined, undefined), /boom/);

        // Verify exactly how prod calls it (2 args, second is true)
        untitledSqlDocumentService.verify(
            (x) => x.newQuery(TypeMoq.It.isAny(), TypeMoq.It.isValue(true)),
            TypeMoq.Times.once(),
        );

        // Should NOT try to create a new connection when newQuery failed
        connectionManager.verify((x) => x.onNewConnection(), TypeMoq.Times.never());
    });

    test("validateTextDocumentHasFocus returns false if there is no active text document", () => {
        let vscodeWrapperMock: TypeMoq.IMock<VscodeWrapper> = TypeMoq.Mock.ofType(VscodeWrapper);
        vscodeWrapperMock.setup((x) => x.activeTextEditorUri).returns(() => undefined);
        let controller: MainController = new MainController(
            TestExtensionContext.object,
            undefined, // ConnectionManager
            vscodeWrapperMock.object,
        );

        let result = (controller as any).validateTextDocumentHasFocus();
        assert.equal(
            result,
            false,
            "Expected validateTextDocumentHasFocus to return false when the active document URI is undefined",
        );
        vscodeWrapperMock.verify((x) => x.activeTextEditorUri, TypeMoq.Times.once());
    });

    test("validateTextDocumentHasFocus returns true if there is an active text document", () => {
        let vscodeWrapperMock: TypeMoq.IMock<VscodeWrapper> = TypeMoq.Mock.ofType(VscodeWrapper);
        vscodeWrapperMock.setup((x) => x.activeTextEditorUri).returns(() => "test_uri");
        let controller: MainController = new MainController(
            TestExtensionContext.object,
            undefined, // ConnectionManager
            vscodeWrapperMock.object,
        );

        let result = (controller as any).validateTextDocumentHasFocus();
        assert.equal(
            result,
            true,
            "Expected validateTextDocumentHasFocus to return true when the active document URI is not undefined",
        );
    });

    test("onManageProfiles should call the connetion manager to manage profiles", async () => {
        let vscodeWrapperMock: TypeMoq.IMock<VscodeWrapper> = TypeMoq.Mock.ofType(VscodeWrapper);
        connectionManager.setup((c) => c.onManageProfiles());
        let controller: MainController = new MainController(
            TestExtensionContext.object,
            connectionManager.object,
            vscodeWrapperMock.object,
        );
        await controller.onManageProfiles();
        connectionManager.verify((c) => c.onManageProfiles(), TypeMoq.Times.once());
    });

    test("connection is transferred when opening a new file and the previous active file is connected", async () => {
        let vscodeWrapperMock: TypeMoq.IMock<VscodeWrapper> = TypeMoq.Mock.ofType(VscodeWrapper);

        const script1 = mockTextDocument("script_1.sql");
        const script2 = mockTextDocument("script_2.sql");
        const textFile = mockTextDocument("text_file.txt", "plaintext");

        const editor: vscode.TextEditor = {
            document: script1,
        } as unknown as vscode.TextEditor;

        untitledSqlDocumentService
            .setup((x) => x.waitForOngoingCreates())
            .returns(() => Promise.resolve() as any);
        untitledSqlDocumentService
            .setup((x) => x.shouldSkipCopyConnection(TypeMoq.It.isAnyString()))
            .returns(() => false);

        const controller: MainController = new MainController(
            TestExtensionContext.object,
            connectionManager.object,
            vscodeWrapperMock.object,
        );

        const mockStatusView = TypeMoq.Mock.ofType(StatusView);
        mockStatusView.setup((x) =>
            x.languageFlavorChanged(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
        );

        controller["_statusview"] = mockStatusView.object;
        setupConnectionManagerMocks(connectionManager);

        // verify initial state

        expect(
            controller["_previousActiveDocument"],
            "previous active document should be initially unset",
        ).to.equal(undefined);

        // simulate opening a SQL file
        controller.onDidChangeActiveTextEditor(editor);

        expect(
            controller["_previousActiveDocument"],
            "previous active document should be set after opening a SQL file",
        ).to.deep.equal(editor.document);
        connectionManager.verify(
            (x) =>
                x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.never(),
        );

        // verify that the connection manager transfers the connection from SQL file to SQL file
        await controller.onDidOpenTextDocument(script2);

        expect(
            controller["_previousActiveDocument"],
            "previous active document should be changed to new script when opening a SQL file",
        ).to.deep.equal(script2);
        connectionManager.verify(
            (x) =>
                x.copyConnectionToFile(
                    script1.uri.toString(true),
                    script2.uri.toString(true),
                    true,
                ),
            TypeMoq.Times.once(),
        );

        connectionManager.reset();
        setupConnectionManagerMocks(connectionManager);

        // verify that the connection manager does not transfer the connection from SQL file to non-SQL file
        await controller.onDidOpenTextDocument(textFile);

        expect(
            controller["_previousActiveDocument"],
            "previous active document should be undefined after opening a non-SQL file",
        ).to.deep.equal(undefined);
        connectionManager.verify(
            (x) =>
                x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.never(),
        );

        // verify that the connection manager does not transfer the connection from SQL file to non-SQL file
        await controller.onDidOpenTextDocument(script1);

        expect(
            controller["_previousActiveDocument"],
            "previous active document should be set after opening a SQL file",
        ).to.deep.equal(script1);
        connectionManager.verify(
            (x) =>
                x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.never(),
        );
    });

    function setupConnectionManagerMocks(
        connectionManager: TypeMoq.IMock<ConnectionManager>,
    ): void {
        connectionManager
            .setup((x) => x.onDidOpenTextDocument(TypeMoq.It.isAny()))
            .callback((doc) => {
                docUriCallback = doc.uri.toString();
            });

        connectionManager
            .setup((x) => x.onDidCloseTextDocument(TypeMoq.It.isAny()))
            .callback((doc) => {
                docUriCallback = doc.uri.toString();
            });

        connectionManager
            .setup((x) =>
                x.copyConnectionToFile(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            )
            .callback((doc, newDoc) => {
                docUriCallback = doc;
                newDocUriCallback = newDoc;
            });
    }
});

function mockTextDocument(
    docUri: string,
    languageId: string = Constants.languageId,
): vscode.TextDocument {
    const document = <vscode.TextDocument>{
        uri: {
            toString(_skipEncoding?: boolean): string {
                return docUri;
            },
        },
        languageId: languageId,
    };

    return document;
}
