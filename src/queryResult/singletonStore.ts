/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISlickRange } from "../models/interfaces";
import { ColumnFilterMap, GetGridScrollPositionResponse } from "../sharedInterfaces/queryResult";

export class QueryResultSingletonStore {
    private static _instance: QueryResultSingletonStore;

    /**
     * Keeping states flat to avoid concurrency issues with updating nested objects.
     */
    public maximizedGridIds: Map<string, string> = new Map<string, string>();
    public resultsTabYOffsets: Map<string, number> = new Map<string, number>();
    public messagesTabYOffsets: Map<string, number> = new Map<string, number>();
    public gridColumnFilters: Map<string, ColumnFilterMap> = new Map<string, ColumnFilterMap>();
    public gridColumnWidths: Map<string, number[]> = new Map<string, number[]>();
    public gridScrollPositions: Map<string, GetGridScrollPositionResponse> = new Map<
        string,
        GetGridScrollPositionResponse
    >();
    public activeSelections: Map<string, ISlickRange[]> = new Map<string, ISlickRange[]>();

    /**
     * Private constructor to prevent instantiation from outside.
     */
    private constructor() {}

    /**
     * Method to get the single instance of the store.
     * @returns The singleton instance of `QueryResultSingletonStore`.
     */
    public static getInstance(): QueryResultSingletonStore {
        if (!QueryResultSingletonStore._instance) {
            QueryResultSingletonStore._instance = new QueryResultSingletonStore();
        }
        return QueryResultSingletonStore._instance;
    }

    public static generateGridKey(uri: string, gridId: string): string {
        return `${uri}::${gridId}`;
    }

    /**
     * Deletes all data associated with a given URI.
     * @param uri The URI whose associated data is to be deleted.
     */
    public deleteUriState(uri: string): void {
        // Delete all entries related to the given URI
        this.maximizedGridIds.delete(uri);
        this.resultsTabYOffsets.delete(uri);
        this.messagesTabYOffsets.delete(uri);
        // For maps that use composite keys, we need to iterate and delete
        for (const key of this.gridColumnFilters.keys()) {
            if (key.startsWith(`${uri}::`)) {
                this.gridColumnFilters.delete(key);
            }
        }
        for (const key of this.gridColumnWidths.keys()) {
            if (key.startsWith(`${uri}::`)) {
                this.gridColumnWidths.delete(key);
            }
        }
        for (const key of this.gridScrollPositions.keys()) {
            if (key.startsWith(`${uri}::`)) {
                this.gridScrollPositions.delete(key);
            }
        }
        for (const key of this.activeSelections.keys()) {
            if (key.startsWith(`${uri}::`)) {
                this.activeSelections.delete(key);
            }
        }
    }
}

// Export the singleton instance
const store = QueryResultSingletonStore.getInstance();
export default store;
