/**
 * 1. Matches double quoted string
 * 2. Matches single quotes string
 * 3. Matches block comments
 * 4. Matches line comments
 */
const stripCommentsRegExp =
    /("(?:[^\\"]*(?:\\.)?)*")|('(?:[^\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;

/**
 * @internal
 */
export function stripComments(content: string): string {
    const result = content.replace(stripCommentsRegExp, (match, _0, _1, m3: string, m4: string) => {
        // Only one of m1, m2, m3, m4 matches
        if (m3) {
            // A block comment. Replace with nothing
            return '';
        } else if (m4) {
            // A line comment. If it ends in \r?\n then keep it.
            const length = m4.length;
            if (length > 2 && m4[length - 1] === '\n') {
                return m4[length - 2] === '\r' ? '\r\n' : '\n';
            } else {
                return '';
            }
        } else {
            // We match a string
            return match;
        }
    });

    return result;
}
