/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotificationType, RequestType } from "vscode-languageclient";
import * as vscodeMssql from "vscode-mssql";

/**
 * Information describing a Node in the Object Explorer tree.
 * Contains information required to display the Node to the user and
 * to know whether actions such as expanding children is possible
 * the node
 */
export class NodeInfo {
    /**
     * Path identifying this node: for example a table will be at ["server", "database", "tables", "tableName"].
     * This enables rapid navigation of the tree without the need for a global registry of elements.
     * The path functions as a unique ID and is used to disambiguate the node when sending requests for expansion.
     * A common ID is needed since processes do not share address space and need a unique identifier
     */
    public nodePath: string;

    /**
     * The type of node - for example Server, Database, Folder, Table
     */
    public nodeType: string;

    /**
     * Label to display to the user, describing this node
     */
    public label: string;

    /**
     * Node sub type - for example a key can have type as "Key" and sub type as "PrimaryKey"
     */
    public nodeSubType: string;

    /**
     * Node status - for example logic can be disabled/enabled
     */
    public nodeStatus: string;

    /**
     * Is this a leaf node (no children) or is it expandable
     */
    public isLeaf: boolean;

    /**
     * Error message returned from the engine for a object explorer node failure reason, if any.
     */
    public errorMessage: string;

    /**
     * Object metadata about the node
     */
    public metadata: vscodeMssql.ObjectMetadata;

    /**
     * Filterable properties that this node supports
     */
    filterableProperties?: vscodeMssql.NodeFilterProperty[];

    /**
     * Object type of the node. In case of folder nodes, this will be the type of objects that are present in the folder
     */
    objectType?: string;

    /**
     * Parent node path. This is used to identify the parent node of the current node
     */
    parentNodePath?: string;
}

/**
 * Information returned from a "ExpandRequest"
 */
export class ExpandResponse {
    /**
     * Unique ID to use when sending any requests for objects in the
     * tree under the node
     */
    public sessionId: string;

    /**
     * Information describing the expanded nodes in the tree
     */
    public nodes: NodeInfo[];

    /**
     * Path identifying the node to expand.
     */
    public nodePath: string;

    /**
     * Error message returned from the engine for a object explorer expand failure reason, if any.
     */
    public errorMessage: string;
}

/**
 * Parameters to the ExpandRequest
 */
export class ExpandParams {
    /**
     * The Id returned from a "CreateSessionRequest". This
     * is used to disambiguate between different trees
     */
    public sessionId: string;

    /**
     * Path identifying the node to expand.
     */
    public nodePath: string;

    /**
     * Filters to apply to the child nodes being returned
     */
    filters?: vscodeMssql.NodeFilter[];
}

/**
 * A request to expand a Node
 */
export namespace ExpandRequest {
    /**
     * Returns children of a given node as a NodeInfo array
     */
    export const type = new RequestType<ExpandParams, boolean, void, void>("objectexplorer/expand");
}

/**
 * Expand notification mapping entry
 */
export namespace ExpandCompleteNotification {
    export const type = new NotificationType<ExpandResponse, void>(
        "objectexplorer/expandCompleted",
    );
}

/**
 * Contains a sessionId to be used when requesting
 * expansion of nodes
 */
export class GetSessionIdResponse {
    /**
     * Unique Id to use when sending any requests for objects in the tree
     * under the node
     */
    public sessionId: string;
}

/**
 * A unique session ID used for all Object Explorer connection subtree mappings.
 * Guaranteed to be unique if any property of the connection details differs (except password).
 */
export namespace GetSessionIdRequest {
    export const type = new RequestType<
        vscodeMssql.ConnectionDetails,
        GetSessionIdResponse,
        void,
        void
    >("objectexplorer/getsessionid");
}

/**
 * Parameters to the RefreshRequest.
 */
export class RefreshParams extends ExpandParams {}

export namespace RefreshRequest {
    /**
     * Returns children of a given node as a NodeInfo array.
     */
    export const type = new RequestType<RefreshParams, boolean, void, void>(
        "objectexplorer/refresh",
    );
}

/**
 * A request to create a new Object Explorer session.
 */
export namespace CreateSessionRequest {
    export const type = new RequestType<
        vscodeMssql.ConnectionDetails,
        CreateSessionResponse,
        void,
        void
    >("objectexplorer/createsession");
}

/**
 * Contains success information, a sessionId to be used when requesting
 * expansion of nodes, and a root node to display for this area
 */
export class CreateSessionResponse {
    /**
     * Unique Id to use when sending any requests for objects in the tree
     * under the node
     */
    public sessionId: string;
}

/**
 * Information returned from a createSessionRequest. Contains success information, a sessionId to be used
 * when requesting expansion of nodes, and a root node to display for this area
 */
export class SessionCreatedParameters {
    /**
     * Boolean indicating if the connection was successful
     */
    public success: boolean;

    /**
     * Unique ID to use when sending any requests for objects in the
     * tree under the node
     */
    public sessionId: string;

    /**
     * Information describing the base node in the tree
     */
    public rootNode: NodeInfo;

    /**
     * Error number returned from the engine, if any.
     */
    public errorNumber: number | undefined;

    /**
     * Error message returned from the engine for an object explorer session
     * failure reason, if any
     */
    public errorMessage: string;
}

/**
 * Connection complete event callback declaration.
 */
export namespace CreateSessionCompleteNotification {
    export const type = new NotificationType<SessionCreatedParameters, void>(
        "objectexplorer/sessioncreated",
    );
}

/**
 * Information returned from a CloseSessionRequest.
 * Contains success information, a SessionId to be used when
 * requesting closing an existing session.
 */
export class CloseSessionResponse {
    /**
     * Boolean indicating if the session was closed successfully
     */
    public success: boolean;

    /**
     * Unique ID to use when sending any requests for objects in the
     * tree under the node
     */
    public sessionId: string;
}

/**
 * Parameters to the CloseSessionRequest
 */
export class CloseSessionParams {
    /**
     * The Id returned from a CreateSessionRequest. This
     * is used to disambiguate between different trees.
     */
    public sessionId: string;
}

/**
 * Information returned when a session is disconnected.
 * Contains success information and a SessionId
 */
export class SessionDisconnectedParameters {
    /**
     * Boolean indicating if the connection was successful
     */
    public success: boolean;

    /**
     * Unique ID to use when sending any requests for objects in the
     * tree under the node
     */
    public sessionId: string;

    /*
     * Error message returned from the engine for a object explorer session failure reason, if any.
     */
    public errorMessage: string;
}

/**
 * Closes an Object Explorer tree session for a specific connection.
 * This will close a connection to a specific server or database
 */
export namespace CloseSessionRequest {
    export const type = new RequestType<CloseSessionParams, CloseSessionResponse, void, void>(
        "objectexplorer/closesession",
    );
}

/**
 * Session disconnected notification
 */
export namespace SessionDisconnectedNotification {
    export const type = new NotificationType<SessionDisconnectedParameters, void>(
        "objectexplorer/sessiondisconnected",
    );
}
