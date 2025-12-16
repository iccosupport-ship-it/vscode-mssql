/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDatabasePlatform } from "./interfaces";

export enum CommandPhase {
    Drop = 0,
    Alter = 1,
    Create = 2,
    PostHelper = 3,
}

export interface DesignerCommand {
    id: string;
    phase: CommandPhase;
    statements: string[];
    description?: string;
    dependencies: Set<string>;
}

export class CommandGraph {
    private readonly _commands = new Map<string, DesignerCommand>();

    addCommand(cmd: DesignerCommand) {
        this._commands.set(cmd.id, cmd);
    }

    getAllCommandIds(): IterableIterator<string> {
        return this._commands.keys();
    }

    toScript(platform: IDatabasePlatform): string {
        const statements: string[] = [];
        this.getSortedCommands().forEach((cmd) => statements.push(...cmd.statements));
        return platform.wrapInTransaction(statements);
    }

    getReportLines(): string[] {
        const lines: string[] = [];
        lines.push("# Schema Designer Change Report\n");
        this.getSortedCommands().forEach((cmd) => {
            if (cmd.description) {
                lines.push(`- ${cmd.description}`);
            }
        });
        return lines;
    }

    private getSortedCommands(): DesignerCommand[] {
        const nodes = Array.from(this._commands.values());
        const inDegree = new Map<string, number>();
        const adj = new Map<string, string[]>();

        // Initialize
        nodes.forEach((node) => {
            inDegree.set(node.id, 0);
            adj.set(node.id, []);
        });

        // Build Graph
        nodes.forEach((node) => {
            node.dependencies.forEach((depId) => {
                if (this._commands.has(depId)) {
                    // depId -> node
                    adj.get(depId)!.push(node.id);
                    inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
                }
            });
        });

        // Kahn's Algorithm with Priority Queue (simulated by sorting)
        const queue: DesignerCommand[] = [];
        nodes.forEach((node) => {
            if (inDegree.get(node.id) === 0) {
                queue.push(node);
            }
        });

        const sorted: DesignerCommand[] = [];

        while (queue.length > 0) {
            // Sort queue by Phase ASC, then ID ASC
            queue.sort((a, b) => {
                if (a.phase !== b.phase) return a.phase - b.phase;
                return a.id.localeCompare(b.id);
            });

            const u = queue.shift()!;
            sorted.push(u);

            const neighbors = adj.get(u.id) || [];
            for (const vId of neighbors) {
                inDegree.set(vId, inDegree.get(vId)! - 1);
                if (inDegree.get(vId) === 0) {
                    queue.push(this._commands.get(vId)!);
                }
            }
        }

        if (sorted.length !== nodes.length) {
            throw new Error("Circular dependency detected in command graph");
        }

        return sorted;
    }
}
