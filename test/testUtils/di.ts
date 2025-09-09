/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { serviceContainer } from "../../src/di";

/**
 * Binds a constant value to the given identifier in the service container.
 * @param identifier The identifier to bind the value to.
 * @param value The constant value to bind.
 */
export function bindConstant<T>(identifier: new (...args: any[]) => T, value: T): void {
    if (serviceContainer.isBound(identifier)) {
        serviceContainer.unbindSync(identifier);
    }
    serviceContainer.bind(identifier).toConstantValue(value as unknown as T);
}

/**
 * Unbinds the given identifier from the service container if it is bound.
 * @param identifier The identifier to unbind.
 */
export function unbindIfBound<T>(identifier: new (...args: any[]) => T): void {
    if (serviceContainer.isBound(identifier)) {
        serviceContainer.unbindSync(identifier);
    }
}
