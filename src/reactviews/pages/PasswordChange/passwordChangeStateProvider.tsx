/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { createContext, ReactNode } from "react";
import { PasswordChangeWebviewState } from "../../../sharedInterfaces/passwordChange";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";
import { WebviewRpc } from "../../common/rpc";

export interface PasswordChangeReactProvider {
    extensionRpc: WebviewRpc<{}>;
}

export const PasswordChangeContext = createContext<PasswordChangeReactProvider | undefined>(
    undefined,
);

interface PasswordChangeProviderProps {
    children: ReactNode;
}

const PasswordChangeStateProvider: React.FC<PasswordChangeProviderProps> = ({ children }) => {
    const { extensionRpc } = useVscodeWebview2<PasswordChangeWebviewState, {}>();
    return (
        <PasswordChangeContext.Provider value={{ extensionRpc }}>
            {children}
        </PasswordChangeContext.Provider>
    );
};

export { PasswordChangeStateProvider };
