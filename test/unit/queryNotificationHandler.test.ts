/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as TypeMoq from "typemoq";
import * as assert from "assert";
import QueryRunner from "../../src/controllers/queryRunner";
import { QueryNotificationHandler } from "../../src/controllers/queryNotificationHandler";
import { NotificationHandler } from "vscode-languageclient";

// TESTS //////////////////////////////////////////////////////////////////////////////////////////
suite("QueryNotificationHandler tests", () => {
    let notificationHandler: QueryNotificationHandler;
    let eventData: any;
    let runnerMock: TypeMoq.IMock<QueryRunner>;

    let batchStartHandlerCalled: boolean;
    let messageHandlerCalled: boolean;
    let resultSetCompleteHandlerCalled: boolean;
    let batchCompleteHandlerCalled: boolean;
    let queryCompleteHandlerCalled: boolean;

    let batchStartHandler: NotificationHandler<any>;
    let messageHandler: NotificationHandler<any>;
    let resultSetCompleteHandler: NotificationHandler<any>;
    let batchCompleteHandler: NotificationHandler<any>;
    let queryCompleteHandler: NotificationHandler<any>;

    setup(() => {
        notificationHandler = new QueryNotificationHandler();
        eventData = { ownerUri: "testUri" };

        // Setup mock - Use the same QueryRunner for the whole test - this tests if it can be reused
        runnerMock = TypeMoq.Mock.ofType(QueryRunner, TypeMoq.MockBehavior.Loose);
        runnerMock.callBase = true;
        runnerMock
            .setup((x) => x.handleBatchStart(TypeMoq.It.isAny()))
            .callback((event) => {
                batchStartHandlerCalled = true;
            });
        runnerMock
            .setup((x) => x.handleMessage(TypeMoq.It.isAny()))
            .callback((event) => {
                messageHandlerCalled = true;
            });
        runnerMock
            .setup((x) => x.handleResultSetComplete(TypeMoq.It.isAny()))
            .callback((event) => {
                resultSetCompleteHandlerCalled = true;
            });
        runnerMock
            .setup((x) => x.handleBatchComplete(TypeMoq.It.isAny()))
            .callback((event) => {
                batchCompleteHandlerCalled = true;
            });
        runnerMock
            .setup((x) => x.handleQueryComplete(TypeMoq.It.isAny()))
            .callback((event) => {
                queryCompleteHandlerCalled = true;
                runnerMock.object.setHasCompleted();
            });

        // Get handlers
        batchStartHandler = notificationHandler.handleBatchStartNotification();
        messageHandler = notificationHandler.handleMessageNotification();
        resultSetCompleteHandler = notificationHandler.handleResultSetCompleteNotification();
        batchCompleteHandler = notificationHandler.handleBatchCompleteNotification();
        queryCompleteHandler = notificationHandler.handleQueryCompleteNotification();
    });

    // Setup booleans to track if handlers were called
    function resetBools(): void {
        batchStartHandlerCalled = false;
        messageHandlerCalled = false;
        resultSetCompleteHandlerCalled = false;
        batchCompleteHandlerCalled = false;
        queryCompleteHandlerCalled = false;
        runnerMock.object.resetHasCompleted();
    }

    test("QueryNotificationHandler handles registerRunner at the beginning of the event flow", (done) => {
        resetBools();

        // If registerRunner is called, the query runner map should be populated
        notificationHandler.registerRunner(runnerMock.object, eventData.ownerUri);
        assert.equal(notificationHandler._queryRunners.size, 1);

        // If the notifications are fired, the callbacks should be immediately fired too
        batchStartHandler(eventData);
        assert.equal(batchStartHandlerCalled, true);
        messageHandler(eventData);
        assert.equal(messageHandlerCalled, true);
        resultSetCompleteHandler(eventData);
        assert.equal(resultSetCompleteHandlerCalled, true);
        batchCompleteHandler(eventData);
        assert.equal(batchCompleteHandlerCalled, true);
        queryCompleteHandler(eventData);
        assert.equal(queryCompleteHandlerCalled, true);

        // And cleanup should happen after queryCompleteHandlerCalled
        assert.equal(
            notificationHandler._queryRunners.size,
            0,
            "Query runner map not cleared after call to handleQueryCompleteNotification()",
        );

        done();
    });

    test("QueryNotificationHandler ignores notifications when no runner is registered", (done) => {
        resetBools();

        // If notifications are fired without a registered runner, they should be ignored
        batchStartHandler(eventData);
        messageHandler(eventData);
        resultSetCompleteHandler(eventData);
        batchCompleteHandler(eventData);
        queryCompleteHandler(eventData);

        // No callbacks should be fired since no runner is registered
        assert.equal(batchStartHandlerCalled, false);
        assert.equal(messageHandlerCalled, false);
        assert.equal(resultSetCompleteHandlerCalled, false);
        assert.equal(batchCompleteHandlerCalled, false);
        assert.equal(queryCompleteHandlerCalled, false);

        // Runner map should remain empty
        assert.equal(notificationHandler._queryRunners.size, 0);

        done();
    });

    test("QueryNotificationHandler handles notification routing to multiple runners", (done) => {
        resetBools();

        // Create a second mock runner and event data for different URI
        let runnerMock2 = TypeMoq.Mock.ofType<QueryRunner>();
        let eventData2 = { ownerUri: "uri2" };
        let runner2Called = false;

        runnerMock2
            .setup((x) => x.handleBatchStart(TypeMoq.It.isAny()))
            .callback(() => {
                runner2Called = true;
            });

        // Register two runners with different URIs
        notificationHandler.registerRunner(runnerMock.object, eventData.ownerUri);
        notificationHandler.registerRunner(runnerMock2.object, eventData2.ownerUri);
        assert.equal(notificationHandler._queryRunners.size, 2);

        // Fire notification for first runner
        batchStartHandler(eventData);
        assert.equal(batchStartHandlerCalled, true);
        assert.equal(runner2Called, false);

        // Fire notification for second runner
        batchStartHandler(eventData2);
        assert.equal(runner2Called, true);

        // Both runners should still be registered
        assert.equal(notificationHandler._queryRunners.size, 2);

        done();
    });

    test("QueryNotificationHandler cleans up runner on query complete", (done) => {
        resetBools();

        // Register runner
        notificationHandler.registerRunner(runnerMock.object, eventData.ownerUri);
        assert.equal(notificationHandler._queryRunners.size, 1);

        // Fire some notifications
        batchStartHandler(eventData);
        messageHandler(eventData);
        assert.equal(batchStartHandlerCalled, true);
        assert.equal(messageHandlerCalled, true);

        // Runner should still be registered
        assert.equal(notificationHandler._queryRunners.size, 1);

        // Fire query complete notification - this should clean up the runner
        queryCompleteHandler(eventData);
        assert.equal(queryCompleteHandlerCalled, true);

        // Runner should be cleaned up
        assert.equal(notificationHandler._queryRunners.size, 0);

        done();
    });
});
