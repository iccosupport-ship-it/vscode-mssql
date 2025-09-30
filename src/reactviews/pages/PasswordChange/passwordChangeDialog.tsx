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
    MessageBar,
    MessageBarBody,
    MessageBarTitle,
} from "@fluentui/react-components";
import { useState } from "react";
import { usePasswordChangeSelector } from "./passwordChangeSelector";
import { EyeOffRegular, EyeRegular } from "@fluentui/react-icons";
import { PasswordChangeResult } from "../../../models/contracts/passwordChange";

const useStyles = makeStyles({
    dialog: {
        minWidth: "480px",
    },
    content: {
        display: "flex",
        flexDirection: "column",
        gap: "20px",
    },
    errorMessage: {
        marginBottom: "4px",
    },
    serverInfo: {
        fontSize: "14px",
        color: "var(--colorNeutralForeground2)",
    },
    passwordField: {
        marginBottom: "0",
    },
});

export const PasswordChangeDialog = ({
    onClose,
    onSubmit,
    errorMessage,
    serverName,
}: {
    onClose?: () => void;
    onSubmit?: (password: string) => Promise<PasswordChangeResult | undefined>;
    errorMessage?: string;
    serverName?: string;
}) => {
    const styles = useStyles();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resultApiError, setResultApiError] = useState<string | undefined>(undefined);

    const passwordsMatch = password === confirmPassword;
    const isPasswordEmpty = password.trim() === "";
    const isConfirmPasswordEmpty = confirmPassword.trim() === "";
    const showPasswordMismatchError = !isConfirmPasswordEmpty && !passwordsMatch;
    const isSubmitDisabled = isPasswordEmpty || isConfirmPasswordEmpty || !passwordsMatch;

    return (
        <Dialog open={true} modalType="modal">
            <DialogSurface className={styles.dialog}>
                <DialogBody>
                    <DialogTitle>Change password</DialogTitle>
                    <DialogContent>
                        <div className={styles.content}>
                            {resultApiError && (
                                <MessageBar
                                    key={resultApiError}
                                    intent={"error"}
                                    className={styles.errorMessage}>
                                    <MessageBarBody>
                                        <MessageBarTitle>Error</MessageBarTitle>
                                        {resultApiError}
                                    </MessageBarBody>
                                </MessageBar>
                            )}
                            {serverName && <div className={styles.serverInfo}>{serverName}</div>}
                            {errorMessage && (
                                <div className={styles.serverInfo}>{errorMessage}</div>
                            )}
                            <Field
                                size="small"
                                className={styles.passwordField}
                                label={"New Password"}
                                required
                                validationMessage={
                                    isPasswordEmpty && password !== ""
                                        ? "Password is required"
                                        : undefined
                                }
                                validationState={
                                    isPasswordEmpty && password !== "" ? "error" : "none"
                                }>
                                <Input
                                    size="small"
                                    type={showPassword ? "text" : "password"}
                                    placeholder={"Enter new password"}
                                    required
                                    value={password}
                                    onChange={(_, data) => setPassword(data.value)}
                                    contentAfter={
                                        <Button
                                            size="small"
                                            onClick={() => setShowPassword(!showPassword)}
                                            appearance="transparent"
                                            icon={
                                                showPassword ? <EyeRegular /> : <EyeOffRegular />
                                            }></Button>
                                    }
                                />
                            </Field>
                            <Field
                                size="small"
                                className={styles.passwordField}
                                label={"Confirm Password"}
                                required
                                validationMessage={
                                    showPasswordMismatchError ? "Passwords do not match" : undefined
                                }
                                validationState={showPasswordMismatchError ? "error" : "none"}>
                                <Input
                                    size="small"
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder={"Confirm new password"}
                                    required
                                    value={confirmPassword}
                                    onChange={(_, data) => setConfirmPassword(data.value)}
                                    contentAfter={
                                        <Button
                                            size="small"
                                            onClick={() =>
                                                setShowConfirmPassword(!showConfirmPassword)
                                            }
                                            appearance="transparent"
                                            icon={
                                                showConfirmPassword ? (
                                                    <EyeRegular />
                                                ) : (
                                                    <EyeOffRegular />
                                                )
                                            }></Button>
                                    }
                                />
                            </Field>
                        </div>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            size="small"
                            appearance="primary"
                            disabled={isSubmitDisabled}
                            onClick={async () => {
                                if (onSubmit) {
                                    const result = await onSubmit(password);
                                    if (result?.errorMessage) {
                                        setResultApiError(result.errorMessage);
                                    }
                                }
                            }}>
                            Change Password
                        </Button>
                        <Button
                            size="small"
                            appearance="secondary"
                            onClick={async () => {
                                void onClose?.();
                            }}>
                            Cancel
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
};
