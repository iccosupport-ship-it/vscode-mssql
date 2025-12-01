/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useContext, useEffect, useState } from "react";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import {
    CheckBoxProperties,
    DesignerDataPropertyInfo,
    DesignerEditType,
    DesignerUIArea,
} from "../../../sharedInterfaces/tableDesigner";
import { Checkbox, Field, Label, Switch } from "@fluentui/react-components";

export type DesignerCheckboxProps = {
    component: DesignerDataPropertyInfo;
    model: CheckBoxProperties;
    componentPath: (string | number)[];
    UiArea: DesignerUIArea;
    showLabel?: boolean;
};

export const DesignerCheckbox = ({
    component,
    model,
    componentPath,
    UiArea,
    showLabel = true,
}: DesignerCheckboxProps) => {
    const [value, setValue] = useState(model.checked);
    const context = useContext(TableDesignerContext);
    if (!context) {
        return undefined;
    }
    useEffect(() => {
        setValue(model.checked);
    }, [model]);
    const isPropertiesView = UiArea === "PropertiesView";
    const shouldUseSwitch = isPropertiesView;
    const controlDisabled = model.enabled === undefined ? false : !model.enabled;
    const renderLabel = () => (
        <Label
            size="small"
            style={{
                display: "flex",
                alignItems: "center",
                height: "100%",
            }}>
            {component.componentProperties.title!}
        </Label>
    );
    const fieldWidth = isPropertiesView
        ? "100%"
        : component.componentProperties.width
          ? `${component.componentProperties.width}px`
          : "400px";
    const control = shouldUseSwitch ? (
        <Switch
            ref={(el) => context.addElementRef(componentPath, el, UiArea)}
            checked={value}
            onChange={async (_event, data) => {
                if (controlDisabled) {
                    return;
                }
                await context.processTableEdit({
                    path: componentPath,
                    value: data.checked,
                    type: DesignerEditType.Update,
                    source: UiArea,
                });
            }}
            disabled={controlDisabled}
        />
    ) : (
        <Checkbox
            ref={(el) => context.addElementRef(componentPath, el, UiArea)}
            checked={value}
            onChange={async (_event, data) => {
                if (controlDisabled) {
                    return;
                }
                await context.processTableEdit({
                    path: componentPath,
                    value: data.checked,
                    type: DesignerEditType.Update,
                    source: UiArea,
                });
            }}
            size="medium"
            disabled={controlDisabled}
        />
    );
    const fieldStyle = isPropertiesView
        ? { width: fieldWidth, paddingLeft: 0, paddingRight: 0 }
        : { width: fieldWidth };
    return (
        <Field
            size="small"
            label={!isPropertiesView && showLabel ? renderLabel() : undefined}
            orientation={isPropertiesView ? "vertical" : "horizontal"}
            style={fieldStyle}>
            {isPropertiesView && showLabel ? (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        gap: "8px",
                        minHeight: "28px",
                    }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                        {renderLabel()}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                        }}>
                        {control}
                    </div>
                </div>
            ) : (
                control
            )}
        </Field>
    );
};
