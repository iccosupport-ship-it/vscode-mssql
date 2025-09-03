/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorThemeKind } from "../../sharedInterfaces/webview";
import { resolveVscodeThemeType } from "./utils";

function cssVar(name: string, root?: HTMLElement | null): string | undefined {
    // Try provided root element first, then body, then documentElement
    const tryEls: (HTMLElement | null | undefined)[] = [
        root,
        document.body,
        document.documentElement,
    ];
    for (const el of tryEls) {
        if (!el) continue;
        const v = getComputedStyle(el).getPropertyValue(name)?.trim();
        if (v) return v;
    }
    return undefined;
}

function baseFromTheme(themeKind: ColorThemeKind): "vs" | "vs-dark" | "hc-black" {
    const t = resolveVscodeThemeType(themeKind);
    if (t === "vs-dark") return "vs-dark";
    if (t === "hc-black") return "hc-black";
    return "vs";
}

export function buildMonacoThemeFromVSCode(themeKind: ColorThemeKind, root?: HTMLElement | null) {
    const colors: Record<string, string> = {};

    const add = (key: string, varName: string) => {
        const val = cssVar(varName, root);
        if (val) colors[key] = val;
    };

    // Essential editor colors
    add("editor.background", "--vscode-editor-background");
    add("editor.foreground", "--vscode-editor-foreground");
    add("editorLineNumber.foreground", "--vscode-editorLineNumber-foreground");
    add("editorLineNumber.activeForeground", "--vscode-editorLineNumber-activeForeground");
    add("editor.selectionBackground", "--vscode-editor-selectionBackground");
    add("editor.inactiveSelectionBackground", "--vscode-editor-inactiveSelectionBackground");
    add("editorCursor.foreground", "--vscode-editorCursor-foreground");
    add("editorWhitespace.foreground", "--vscode-editorWhitespace-foreground");
    add("editorIndentGuide.background", "--vscode-editorIndentGuide-background");
    add("editorIndentGuide.activeBackground", "--vscode-editorIndentGuide-activeBackground");
    add("editorLineHighlightBackground", "--vscode-editor-lineHighlightBackground");
    add("editorLineHighlightBorder", "--vscode-editor-lineHighlightBorder");
    add("editorGutter.background", "--vscode-editorGutter-background");

    // Scrollbar colors (ensure correct variables and sensible fallbacks)
    const addF = (key: string, varName: string, fallback: string) => {
        colors[key] = cssVar(varName, root) || fallback;
    };
    add("scrollbar.shadow", "--vscode-scrollbar-shadow");
    addF(
        "scrollbarSlider.background",
        "--vscode-scrollbarSlider-background",
        "rgba(121,121,121,0.4)",
    );
    addF(
        "scrollbarSlider.hoverBackground",
        "--vscode-scrollbarSlider-hoverBackground",
        "rgba(100,100,100,0.6)",
    );
    addF(
        "scrollbarSlider.activeBackground",
        "--vscode-scrollbarSlider-activeBackground",
        "rgba(191,191,191,0.5)",
    );

    // Find / selection highlight (optional but useful)
    add("editor.findMatchBackground", "--vscode-editor-findMatchBackground");
    add("editor.findMatchHighlightBackground", "--vscode-editor-findMatchHighlightBackground");
    add("editor.selectionHighlightBackground", "--vscode-editor-selectionHighlightBackground");

    return {
        base: baseFromTheme(themeKind),
        inherit: true,
        rules: [],
        colors,
    } as const;
}

export function applyVSCodeThemeToMonaco(
    monaco: any,
    themeKind: ColorThemeKind,
    name = "mssql-vscode-theme",
    root?: HTMLElement | null,
) {
    if (!monaco) return name;
    const theme = buildMonacoThemeFromVSCode(themeKind, root);
    monaco.editor.defineTheme(name, theme as any);
    monaco.editor.setTheme(name);
    return name;
}
