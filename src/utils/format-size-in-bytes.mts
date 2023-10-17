/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */

export function formatSizeInBytes(size: number): string {
    if (size < 1024) {
        return `${size.toLocaleString('en-US', { maximumFractionDigits: 2 })} bytes`;
    } else if (size < 1024 * 1024) {
        return `${(size / 1024).toLocaleString('en-US', { maximumFractionDigits: 2 })} KB`;
    } else {
        return `${(size / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 2 })} MB`;
    }
}
