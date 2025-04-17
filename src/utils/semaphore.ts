/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Semaphore {
    private _locked = false;
    private _waiting: (() => void)[] = [];
    private _autoReleaseTimer: NodeJS.Timeout | null = null;

    /**
     * Acquires the semaphore and optionally sets a release timeout.
     * If the lock isn't released manually within `releaseTimeoutMs`, it will be auto-released.
     * @param releaseTimeoutMs Optional timeout in milliseconds after which the lock is auto-released
     */
    async acquire(releaseTimeoutMs?: number): Promise<void> {
        if (!this._locked) {
            this._locked = true;
            this._startAutoReleaseTimer(releaseTimeoutMs);
            return;
        }

        return new Promise((resolve) => {
            const onAcquire = () => {
                this._locked = true;
                this._startAutoReleaseTimer(releaseTimeoutMs);
                resolve();
            };
            this._waiting.push(onAcquire);
        });
    }

    /**
     * Releases the semaphore. If there are waiting callers, grants the lock to the next.
     */
    release(): void {
        if (this._autoReleaseTimer) {
            clearTimeout(this._autoReleaseTimer);
            this._autoReleaseTimer = null;
        }

        if (this._waiting.length > 0) {
            const next = this._waiting.shift();
            next?.(); // Pass control to next waiter
        } else {
            this._locked = false;
        }
    }

    private _startAutoReleaseTimer(timeoutMs?: number): void {
        if (this._autoReleaseTimer) {
            clearTimeout(this._autoReleaseTimer);
        }

        if (typeof timeoutMs === "number" && timeoutMs > 0) {
            this._autoReleaseTimer = setTimeout(() => {
                this.release(); // auto-release
            }, timeoutMs);
        }
    }
}
