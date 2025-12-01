/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useContext, useEffect, useState } from "react";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import {
    DesignerDataPropertyInfo,
    DesignerEditType,
    DesignerUIArea,
    DropDownProperties,
} from "../../../sharedInterfaces/tableDesigner";
import { Field, InfoLabel } from "@fluentui/react-components";
import { SearchableDropdown } from "../../common/searchableDropdown.component";

export type DesignerDropdownProps = {
    component: DesignerDataPropertyInfo;
    model: DropDownProperties;
    componentPath: (string | number)[];
    UiArea: DesignerUIArea;
    showLabel?: boolean;
    showError?: boolean;
    horizontal?: boolean;
    renderInTable?: boolean;
};

export const DesignerDropdown = ({
    component,
    model,
    componentPath,
    UiArea,
    showLabel = true,
    showError = true,
    horizontal = false,
    renderInTable = false,
}: DesignerDropdownProps) => {
    const [value, setValue] = useState<string[]>([]);
    const context = useContext(TableDesignerContext);
    if (!context) {
        return undefined;
    }
    const width =
        UiArea === "PropertiesView" ? "100%" : (component.componentProperties.width ?? "350px");
    //const dropdownId = useId(context.getComponentId(componentPath) ?? "");

    useEffect(() => {
        setValue([model.value]);
    }, [model]);

    const isTableCell = renderInTable;
    const dropdownHeight = isTableCell ? "22px" : "auto";

    const dropdownControl = (
        <SearchableDropdown
            style={{
                width: isTableCell ? "100%" : width,
                minWidth: isTableCell ? undefined : width,
                maxWidth: isTableCell ? undefined : width,
                height: dropdownHeight,
                minHeight: dropdownHeight,
                border: context.getErrorMessage(componentPath)
                    ? "1px solid var(--vscode-errorForeground)"
                    : undefined,
                fontSize: isTableCell ? "11px" : undefined,
                borderRadius: isTableCell ? 0 : undefined,
                backgroundColor: isTableCell ? "transparent" : undefined,
                boxShadow: isTableCell ? "none" : undefined,
                borderColor: isTableCell ? "transparent" : undefined,
            }}
            options={model.values
                .sort((a, b) => a.localeCompare(b))
                .map((option) => ({
                    text: option,
                    value: option,
                }))}
            onSelect={(option) => {
                if (model.enabled === false) {
                    return;
                }
                context.processTableEdit({
                    path: componentPath,
                    value: option.value.toString(),
                    type: DesignerEditType.Update,
                    source: UiArea,
                });
            }}
            size="small"
            selectedOption={{
                value: value[0],
            }}
            ariaLabel={component.componentProperties.title}
        />
    );

    if (isTableCell) {
        return dropdownControl;
    }

    const labelContent = showLabel ? (
        <InfoLabel size="small" info={component.description} aria-hidden="true">
            {component.componentProperties.title ?? component.propertyName}
        </InfoLabel>
    ) : undefined;

    return (
        <Field
            label={labelContent ? { children: labelContent } : undefined}
            validationState={
                showError && context.getErrorMessage(componentPath) ? "error" : undefined
            }
            validationMessage={showError ? context.getErrorMessage(componentPath) : ""}
            style={{ width: width }}
            size="small"
            orientation={horizontal ? "horizontal" : "vertical"}>
            {dropdownControl}
        </Field>
    );
};
