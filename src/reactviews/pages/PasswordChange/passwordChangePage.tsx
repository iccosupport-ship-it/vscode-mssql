/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeStyles } from "@fluentui/react-components";
import { PasswordChangeDialog } from "./passwordChangeDialog";
import { useContext } from "react";
import { PasswordChangeContext } from "./passwordChangeStateProvider";
import {
    CancelPasswordChangeNotificationParams,
    ChangePasswordRequestType,
} from "../../../sharedInterfaces/passwordChange";
import { usePasswordChangeSelector } from "./passwordChangeSelector";

// Define styles for the component
const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        width: "600px",
        maxWidth: "calc(100% - 20px)",
        "> *": {
            marginBottom: "15px",
        },
        padding: "10px",
    },
});

/**
 * Component for adding a firewall rule to an Azure SQL server
 */
export const PasswordChangePage = () => {
    const classes = useStyles();
    const context = useContext(PasswordChangeContext);
    const error = usePasswordChangeSelector((state) => state.errorMessage);

    return (
        <div className={classes.root}>
            <PasswordChangeDialog
                errorMessage={error}
                onSubmit={async (newPassword) => {
                    const result = await context?.extensionRpc?.sendRequest(
                        ChangePasswordRequestType,
                        newPassword,
                    );
                    return result;
                }}
                onClose={async () => {
                    await context?.extensionRpc?.sendNotification(
                        CancelPasswordChangeNotificationParams,
                    );
                }}
            />
        </div>
    );
};
