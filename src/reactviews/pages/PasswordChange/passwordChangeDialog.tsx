/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    Field,
    Input,
    makeStyles,
} from "@fluentui/react-components";
import { useContext } from "react";
import { PasswordChangeContext } from "./passwordChangeStateProvider";
import { usePasswordChangeSelector } from "./passwordChangeSelector";

const useStyles = makeStyles({
    dialog: {
        minWidth: "480px",
    },
    serverInfo: {
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: "#f3f2f1",
        borderRadius: "4px",
    },
    passwordField: {
        marginBottom: "16px",
    },
    validationMessage: {
        fontSize: "12px",
        marginTop: "4px",
    },
    loadingContainer: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
});

export const PasswordChangeDialog = () => {
    const styles = useStyles();
    const context = useContext(PasswordChangeContext);
    const serverName = usePasswordChangeSelector((state) => state.serverDisplayName);

    const handleNewPasswordChange = (value: string) => {
        // Handle new password input change
    };

    const handleConfirmPasswordChange = (value: string) => {
        // Handle confirm password input change
    };

    return (
        <Dialog open={true} modalType="modal">
            <DialogSurface className={styles.dialog}>
                <DialogBody>
                    <DialogTitle>{"Change password for " + serverName}</DialogTitle>
                    <DialogContent>
                        <Field className={styles.passwordField} label={"New Password"}>
                            <Input
                                type="password"
                                value={""}
                                onChange={(_, data) => handleNewPasswordChange(data.value)}
                                placeholder={"Enter new password"}
                            />
                        </Field>
                        <Field className={styles.passwordField} label={"Confirm Password"}>
                            <Input
                                type="password"
                                value={""}
                                onChange={(_, data) => handleConfirmPasswordChange(data.value)}
                                placeholder={"Confirm new password"}
                            />
                        </Field>
                    </DialogContent>
                    <DialogActions>
                        <Button appearance="primary" onClick={() => {}}>
                            Change Password
                        </Button>
                        <Button appearance="secondary">Cancel</Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
};
