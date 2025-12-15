/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../sharedInterfaces/schemaDesigner";

export class SchemaDesignerInMemoryService implements SchemaDesigner.ISchemaDesignerService {
    createSession(
        request: SchemaDesigner.CreateSessionRequest,
    ): Thenable<SchemaDesigner.CreateSessionResponse> {
        throw new Error("Method not implemented.");
    }
    disposeSession(request: SchemaDesigner.DisposeSessionRequest): Thenable<void> {
        throw new Error("Method not implemented.");
    }
    publishSession(request: SchemaDesigner.PublishSessionRequest): Thenable<void> {
        throw new Error("Method not implemented.");
    }
    getDefinition(
        request: SchemaDesigner.GetDefinitionRequest,
    ): Thenable<SchemaDesigner.GetDefinitionResponse> {
        throw new Error("Method not implemented.");
    }
    generateScript(
        request: SchemaDesigner.GenerateScriptRequest,
    ): Thenable<SchemaDesigner.GenerateScriptResponse> {
        throw new Error("Method not implemented.");
    }
    getReport(
        request: SchemaDesigner.GetReportRequest,
    ): Thenable<SchemaDesigner.GetReportResponse> {
        throw new Error("Method not implemented.");
    }
    onSchemaReady(listener: (model: SchemaDesigner.SchemaDesignerSession) => void): void {
        throw new Error("Method not implemented.");
    }
}
