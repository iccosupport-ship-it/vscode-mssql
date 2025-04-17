/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import * as vscodeMssql from "vscode-mssql";
import { TreeNodeInfo } from "../treeNodeInfo";
import * as ConnInfo from "../../models/connectionInfo";
import * as Constants from "../../constants/constants";
import { NodeInfo } from "../../models/contracts/objectExplorer/nodeInfo";
import { ObjectExplorerUtils } from "../objectExplorerUtils";

const disconnectedNodeContextValue: vscodeMssql.TreeNodeContextValue = {
    type: Constants.disconnectedServerNodeType,
    filterable: false,
    hasFilters: false,
    subType: "",
};

export class ConnectionNode extends TreeNodeInfo {
    constructor(connectionInfo: vscodeMssql.IConnectionInfo) {
        const label =
            ConnInfo.getSimpleConnectionDisplayName(connectionInfo) === connectionInfo.server
                ? ConnInfo.getConnectionDisplayName(connectionInfo)
                : ConnInfo.getSimpleConnectionDisplayName(connectionInfo);

        super(
            label,
            disconnectedNodeContextValue,
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            undefined,
            Constants.disconnectedServerNodeType,
            undefined,
            connectionInfo,
            undefined,
            undefined,
        );
        if (connectionInfo.database) {
            this.iconPath = ObjectExplorerUtils.iconPath(Constants.database_red);
            this.nodeSubType = Constants.databaseLabel;
        }
    }

    public onConnected(
        nodeInfo: NodeInfo,
        sessionId: string,
        parentNode: TreeNodeInfo,
        connectionInfo: vscodeMssql.IConnectionInfo,
        label: string,
    ) {
        this.label = label;
        this.context = {
            type: Constants.serverLabel,
            filterable: nodeInfo.filterableProperties?.length > 0,
            hasFilters: false,
            subType: connectionInfo.database ? "Database" : nodeInfo.nodeSubType,
        };
        this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        this.nodePath = nodeInfo.nodePath;
        this.nodeStatus = nodeInfo.nodeStatus;
        this.nodeType = Constants.serverLabel;
        this.sessionId = sessionId;
        this.updateConnectionInfo(connectionInfo);
        this.parentNode = parentNode;
        this.filterableProperties = nodeInfo.filterableProperties;
        this.updateMetadata(nodeInfo.metadata);

        if (connectionInfo.database) {
            this.iconPath = ObjectExplorerUtils.iconPath(Constants.database_red);
        }
    }

    public onDisconnected() {
        this.label = ConnInfo.getSimpleConnectionDisplayName(this.connectionInfo);
        this.context = {
            type: Constants.disconnectedServerNodeType,
            filterable: false,
            hasFilters: false,
            subType: "",
        };
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        this.nodePath = undefined;
        this.nodeStatus = undefined;
        this.nodeType = Constants.disconnectedServerNodeType;
        this.sessionId = undefined;
        this.parentNode = undefined;
        this.filterableProperties = undefined;
        this.nodeSubType = this.connectionInfo.database ? "Database" : undefined;
    }
}
