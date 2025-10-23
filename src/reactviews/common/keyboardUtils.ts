/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMac } from "./utils";

export interface ShortcutMatcher {
    key?: string;
    code?: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
}

export interface ShortcutInfo {
    matcher: ShortcutMatcher;
    display: string;
}

type TokenHandler = (matcher: ShortcutMatcher, displayTokens: string[]) => void;

type KeyResolution = {
    key: string;
    code?: string;
    display: string;
};

const modifierHandlers: Record<string, TokenHandler> = {
    ctrl: (matcher, displayTokens) => {
        matcher.ctrlKey = true;
        displayTokens.push("Ctrl");
    },
    control: (matcher, displayTokens) => {
        matcher.ctrlKey = true;
        displayTokens.push("Ctrl");
    },
    shift: (matcher, displayTokens) => {
        matcher.shiftKey = true;
        displayTokens.push("Shift");
    },
    alt: (matcher, displayTokens) => {
        matcher.altKey = true;
        displayTokens.push("Alt");
    },
    option: (matcher, displayTokens) => {
        matcher.altKey = true;
        displayTokens.push(isMac() ? "Option" : "Alt");
    },
    cmd: (matcher, displayTokens) => {
        matcher.metaKey = true;
        displayTokens.push(isMac() ? "Cmd" : "Meta");
    },
    command: (matcher, displayTokens) => {
        matcher.metaKey = true;
        displayTokens.push(isMac() ? "Cmd" : "Meta");
    },
    meta: (matcher, displayTokens) => {
        matcher.metaKey = true;
        displayTokens.push("Meta");
    },
    win: (matcher, displayTokens) => {
        matcher.metaKey = true;
        displayTokens.push("Win");
    },
    windows: (matcher, displayTokens) => {
        matcher.metaKey = true;
        displayTokens.push("Win");
    },
    ctrlcmd: (matcher, displayTokens) => {
        if (isMac()) {
            matcher.metaKey = true;
            displayTokens.push("Cmd");
        } else {
            matcher.ctrlKey = true;
            displayTokens.push("Ctrl");
        }
    },
};

const specialKeyMap: Record<string, KeyResolution> = {
    enter: { key: "Enter", code: "Enter", display: "Enter" },
    return: { key: "Enter", code: "Enter", display: "Enter" },
    escape: { key: "Escape", code: "Escape", display: "Esc" },
    esc: { key: "Escape", code: "Escape", display: "Esc" },
    tab: { key: "Tab", code: "Tab", display: "Tab" },
    space: { key: " ", code: "Space", display: "Space" },
    spacebar: { key: " ", code: "Space", display: "Space" },
    backspace: { key: "Backspace", code: "Backspace", display: "Backspace" },
    delete: { key: "Delete", code: "Delete", display: "Delete" },
    del: { key: "Delete", code: "Delete", display: "Delete" },
    home: { key: "Home", code: "Home", display: "Home" },
    end: { key: "End", code: "End", display: "End" },
    pageup: { key: "PageUp", code: "PageUp", display: "PageUp" },
    pgup: { key: "PageUp", code: "PageUp", display: "PageUp" },
    pagedown: { key: "PageDown", code: "PageDown", display: "PageDown" },
    pgdn: { key: "PageDown", code: "PageDown", display: "PageDown" },
    up: { key: "ArrowUp", code: "ArrowUp", display: "Up" },
    arrowup: { key: "ArrowUp", code: "ArrowUp", display: "Up" },
    down: { key: "ArrowDown", code: "ArrowDown", display: "Down" },
    arrowdown: { key: "ArrowDown", code: "ArrowDown", display: "Down" },
    left: { key: "ArrowLeft", code: "ArrowLeft", display: "Left" },
    arrowleft: { key: "ArrowLeft", code: "ArrowLeft", display: "Left" },
    right: { key: "ArrowRight", code: "ArrowRight", display: "Right" },
    arrowright: { key: "ArrowRight", code: "ArrowRight", display: "Right" },
    comma: { key: ",", code: "Comma", display: "," },
    period: { key: ".", code: "Period", display: "." },
    dot: { key: ".", code: "Period", display: "." },
    slash: { key: "/", code: "Slash", display: "/" },
    forwardslash: { key: "/", code: "Slash", display: "/" },
    backslash: { key: "\\", code: "Backslash", display: "\\" },
    minus: { key: "-", code: "Minus", display: "-" },
    hyphen: { key: "-", code: "Minus", display: "-" },
    equal: { key: "=", code: "Equal", display: "=" },
    equals: { key: "=", code: "Equal", display: "=" },
    semicolon: { key: ";", code: "Semicolon", display: ";" },
    quote: { key: "'", code: "Quote", display: "'" },
    apostrophe: { key: "'", code: "Quote", display: "'" },
    backquote: { key: "`", code: "Backquote", display: "`" },
    backtick: { key: "`", code: "Backquote", display: "`" },
};

const FUNCTION_KEY_REGEX = /^f([1-9]|1[0-2])$/;

function normalize(raw?: string): string[] {
    if (!raw) {
        return [];
    }
    return raw
        .split("+")
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0);
}

function resolveKeyToken(token: string): KeyResolution | undefined {
    if (token.length === 1 && token >= "a" && token <= "z") {
        return {
            key: token,
            code: `Key${token.toUpperCase()}`,
            display: token.toUpperCase(),
        };
    }

    if (token.length === 1 && token >= "0" && token <= "9") {
        return {
            key: token,
            code: `Digit${token}`,
            display: token,
        };
    }

    if (FUNCTION_KEY_REGEX.test(token)) {
        const value = token.toUpperCase();
        return { key: value, code: value, display: value };
    }

    return specialKeyMap[token];
}

function buildShortcut(tokens: string[]): ShortcutInfo | undefined {
    if (!tokens.length) {
        return undefined;
    }

    const matcher: ShortcutMatcher = {};
    const displayTokens: string[] = [];
    let keyAssigned = false;

    for (const token of tokens) {
        const modifierHandler = modifierHandlers[token];
        if (modifierHandler) {
            modifierHandler(matcher, displayTokens);
            continue;
        }

        if (keyAssigned) {
            // Unsupported chord; only single primary key is handled.
            return undefined;
        }

        const keyInfo = resolveKeyToken(token);
        if (!keyInfo) {
            return undefined;
        }

        matcher.key = keyInfo.key;
        if (keyInfo.code) {
            matcher.code = keyInfo.code;
        }
        displayTokens.push(keyInfo.display);
        keyAssigned = true;
    }

    if (!keyAssigned) {
        return undefined;
    }

    return { matcher, display: displayTokens.join("+") };
}

export function getShortcutInfo(raw: string | undefined, fallback: string): ShortcutInfo {
    const primaryTokens = normalize(raw);
    const primary = buildShortcut(primaryTokens);
    if (primary) {
        return primary;
    }

    const fallbackTokens = normalize(fallback);
    const resolvedFallback = buildShortcut(fallbackTokens);
    if (resolvedFallback) {
        return resolvedFallback;
    }

    return { matcher: {}, display: "" };
}

export function eventMatchesShortcut(event: KeyboardEvent, matcher: ShortcutMatcher): boolean {
    if (matcher.ctrlKey !== undefined && matcher.ctrlKey !== event.ctrlKey) {
        return false;
    }
    if (matcher.metaKey !== undefined && matcher.metaKey !== event.metaKey) {
        return false;
    }
    if (matcher.altKey !== undefined && matcher.altKey !== event.altKey) {
        return false;
    }
    if (matcher.shiftKey !== undefined && matcher.shiftKey !== event.shiftKey) {
        return false;
    }

    if (matcher.code !== undefined && matcher.code !== event.code) {
        return false;
    }

    if (matcher.code === undefined && matcher.key !== undefined) {
        const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const matcherKey = matcher.key.length === 1 ? matcher.key.toLowerCase() : matcher.key;
        if (eventKey !== matcherKey) {
            return false;
        }
    }

    return true;
}
