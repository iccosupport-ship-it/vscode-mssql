/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../sharedInterfaces/schemaDesigner";
import { CommandGraph } from "./commandGraph";
import { IDatabasePlatform, IQueryExecutor, ITableGenerator } from "./interfaces";
import { TableHandler } from "./handlers/tableHandler";
import { SchemaCommandContext } from "./schemaCommandContext";
import { generateGuid } from "../../models/utils";

// Internal State Helper
interface SessionState {
    sessionId: string;
    ownerUri: string;
    schema: SchemaDesigner.Schema;
    originalSchema: SchemaDesigner.Schema;
    platform: IDatabasePlatform;
    executor: IQueryExecutor;
}

export class SchemaDesignerInMemoryService implements SchemaDesigner.ISchemaDesignerService {
    private readonly _sessions = new Map<string, SessionState>();
    // We register the handlers once for this service
    private readonly _handlers = [new TableHandler()];

    /**
     * Dependency Injection for the specific Platform.
     * In a real extension, you might pass a PlatformFactory here.
     * For now, we assume the session request provides enough info or we inject a default.
     */
    constructor(
        private readonly _defaultPlatform: IDatabasePlatform,
        private readonly _executorFactory: (uri: string) => IQueryExecutor,
    ) {}

    async createSession(
        request: SchemaDesigner.CreateSessionRequest,
    ): Promise<SchemaDesigner.CreateSessionResponse> {
        if (!request.ownerUri) throw new Error("Owner URI required");

        const sessionId = generateGuid();
        const executor = this._executorFactory(request.ownerUri);

        // 1. Load Schema using Modular Loaders
        const loaders = this._defaultPlatform.getObjectLoaders();
        const schema: SchemaDesigner.Schema = { tables: [] }; // Base schema

        const [schemaNames, dataTypes] = await Promise.all([
            this._defaultPlatform.getSchemaNames(request.ownerUri, executor),
            this._defaultPlatform.getDataTypes(request.ownerUri, executor),
        ]);

        await Promise.all(
            loaders.map(async (loader) => {
                try {
                    const data = await loader.load(request.ownerUri, executor);
                    (schema as any)[loader.objectTypeKey] = data;
                } catch (e) {
                    console.error(`Failed to load ${loader.objectTypeKey}`, e);
                    (schema as any)[loader.objectTypeKey] = [];
                }
            }),
        );

        const originalClone = JSON.parse(JSON.stringify(schema));
        const sessionSchema = JSON.parse(JSON.stringify(schema));

        this._sessions.set(sessionId, {
            sessionId,
            ownerUri: request.ownerUri,
            schema: sessionSchema,
            originalSchema: originalClone,
            platform: this._defaultPlatform,
            executor: executor,
        });

        return {
            schema: sessionSchema,
            dataTypes: dataTypes,
            schemaNames: schemaNames,
            sessionId,
        };
    }
    async disposeSession(request: SchemaDesigner.DisposeSessionRequest): Promise<void> {
        this._sessions.delete(request.sessionId);
    }

    async publishSession(request: SchemaDesigner.PublishSessionRequest): Promise<void> {
        const session = this.getSession(request.sessionId);

        // 1. Generate Script
        const script = this.generateScriptInternal(session, session.schema);
        if (!script || !script.trim()) return;

        // 2. Execute
        await session.executor.execute(script);

        // 3. Update State
        session.originalSchema = JSON.parse(JSON.stringify(session.schema));
        session.schema = JSON.parse(JSON.stringify(session.schema));
    }

    async getDefinition(
        request: SchemaDesigner.GetDefinitionRequest,
    ): Promise<SchemaDesigner.GetDefinitionResponse> {
        const session = this.getSession(request.sessionId);

        session.schema = request.updatedSchema;

        // Generate full CREATE script for the whole schema
        // We use the 'tables' generator for full scripts
        const gen = session.platform.getGeneratorRegistry().getGenerator<ITableGenerator>("tables");

        const parts = request.updatedSchema.tables.map((t) => gen.generateFullTableScript(t));
        // Add views, etc.

        return { script: parts.join("\n\n") };
    }

    async generateScript(
        request: SchemaDesigner.GenerateScriptRequest,
    ): Promise<SchemaDesigner.GenerateScriptResponse> {
        const session = this.getSession(request.sessionId);
        const script = this.generateScriptInternal(session, session.schema);
        return { script };
    }

    async getReport(
        request: SchemaDesigner.GetReportRequest,
    ): Promise<SchemaDesigner.GetReportResponse> {
        const session = this.getSession(request.sessionId);

        // Use the internal graph logic to get a report
        const graph = new CommandGraph();
        const ctx = new SchemaCommandContext(
            session.originalSchema,
            request.updatedSchema,
            graph,
            session.platform.getGeneratorRegistry(),
        );

        this._handlers.forEach((h) => h.buildCommands(ctx));

        const lines = graph.getReportLines();

        return {
            hasSchemaChanged: lines.length > 0,
            dacReport: {
                report: lines.join("\n"),
                hasWarnings: false,
                possibleDataLoss: graph.hasDataLoss(),
                requireTableRecreation: false,
            },
        };
    }

    onSchemaReady(_listener: (model: SchemaDesigner.SchemaDesignerSession) => void): void {
        // NO-OP
    }

    private getSession(id: string): SessionState {
        const s = this._sessions.get(id);
        if (!s) throw new Error("Session not found");
        return s;
    }

    /**
     * The Core Orchestration Logic (Modular)
     */
    private generateScriptInternal(session: SessionState, updated: SchemaDesigner.Schema): string {
        const graph = new CommandGraph();
        const ctx = new SchemaCommandContext(
            session.originalSchema,
            updated,
            graph,
            session.platform.getGeneratorRegistry(),
        );

        // Run all registered handlers
        for (const handler of this._handlers) {
            handler.buildCommands(ctx);
        }

        return graph.toScript(session.platform);
    }
}
