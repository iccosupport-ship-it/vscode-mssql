/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaCommandContext } from "./schemaCommandContext";

export interface ISchemaObjectHandler {
    buildCommands(ctx: SchemaCommandContext): void;
}
