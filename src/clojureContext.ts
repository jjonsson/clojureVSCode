export enum ClojureContext {
    STRING_LITERAL = 'string',
    COMMENT = 'comment',
    CHARACTER_LITERAL = 'char',
    OTHER = 'other'
}

interface ContextRange {
    type: ClojureContext;
    range: [number, number]; // [start, end)
}

const CHARACTERS = [
    'newline',
    'space',
    'tab',
    'formfeed',
    'backspace',
    'return',
];

// Objects of this class search a document for strings and comments upon construction.
// Then, objects can be queried to find out what context an offset is in.
export class ClojureContextResolver {
    private contexts: Array<ContextRange>;
    private document: string;

    // scan forward until a matching pair of quotes is found or the document ends
    private findStringEnd(offset: number): number {
        let result: number;

        for (result = offset; result < this.document.length; result++) {
            if (this.document[result] === '\\') { // Java escape character
                result++; // skip one character
            }
            else if (this.document[result] === '"') {
                break;
            }
        }

        return result;
    }

    // scan forward until a new line is found or the document ends
    private findCommentEnd(offset: number): number {
        let result: number;

        for (result = offset; result < this.document.length; result++) {
            if (this.document[result] === '\n') {
                break;
            }
        }

        return result;
    }

    private findCharacterLiteralEnd(offset: number) {
        // match the next few characters with a given word
        const lookahead = (match: string) => {
            for (let i = 0; i < match.length; i++) {
                if (offset + i >= this.document.length) { // we've gone off the end of the document
                    return false;
                }
                if (this.document[offset + i] !== match[i]) { // this character doesn't match
                    return false;
                }
            }
            return true;
        };

        if (lookahead('u')) { // unicode character of the form \uNNNN
            offset += 4;
        }
        else if (lookahead('o')) { // octal character of the form \oNNN
            offset += 3;
        }
        else {
            let charCodeMatched = false;
            for (let charCode of CHARACTERS) { // match characters like \tab or \newline
                if (lookahead(charCode)) {
                    offset += charCode.length;
                    charCodeMatched = true;
                    break;
                }
            }
            if (!charCodeMatched) { // this is just a single character
                offset++;
            }
        }

        return offset;
    }

    // parse a document for strings and comments (this is where the hard work is done)
    public constructor(document: string) {
        this.contexts = [];
        this.document = document;

        for (let offset = 0; offset < document.length; offset++) {
            if (document[offset] === '\\') {
                const startIndex = offset;
                offset = this.findCharacterLiteralEnd(offset + 1);
                this.contexts.push({
                    type: ClojureContext.CHARACTER_LITERAL,
                    range: [startIndex + 1, offset + 1],
                });
            }
            else if (document[offset] === '"') {
                const startIndex = offset;
                offset = this.findStringEnd(offset + 1);
                this.contexts.push({
                    type: ClojureContext.STRING_LITERAL,
                    range: [startIndex + 1, offset + 1],
                });
            }
            else if (document[offset] === ';') {
                const startIndex = offset;
                offset = this.findCommentEnd(offset + 1);
                this.contexts.push({
                    type: ClojureContext.COMMENT,
                    range: [startIndex + 1, offset + 1],
                });
            }
        }
    }

    // binary search for a context that contains this offset
    private findContext(offset: number, startIndex: number, endIndex: number): ClojureContext {
        const contains = (range: [number, number], i: number) => 
            range[0] <= i && i < range[1];

        const pivotIndex = Math.floor((endIndex - startIndex) / 2) + startIndex;
        if (startIndex >= endIndex) { // base case
            return ClojureContext.OTHER;
        }
        else if (contains(this.contexts[pivotIndex].range, offset)) {
            return this.contexts[pivotIndex].type;
        }
        else if (offset < this.contexts[pivotIndex].range[0]) {
            return this.findContext(offset, startIndex, pivotIndex);
        }
        else if (offset >= this.contexts[pivotIndex].range[1]) {
            return this.findContext(offset, pivotIndex + 1, endIndex);
        }
        console.error('Context search function exceeded the bounds of the document.');
        return ClojureContext.OTHER;
    }

    // search the document to figure out what kind of context the offset is in (like string or comment)
    public getContext(offset: number): ClojureContext {
        return this.findContext(offset, 0, this.contexts.length);
    }
}

const brackets = new Map([['{', '}'], ['[', ']'], ['(', ')']]);

// return a pair of numbers that mark the beginning and end of the form that immediately encloses the given range
export function getCurrentForm(text: string, startOffset: number, endOffset: number): [number, number] {
    const contextResolver = new ClojureContextResolver(text);

    const closeBracketStack: string[] = [];

    let currentOffset: number;  // start at the last character in the selection

    // seek backwards from the end of the selection until the start is reached
    //   collect open brackets to match against later
    for (currentOffset = endOffset - 1; currentOffset >= startOffset; currentOffset--) {
        if (contextResolver.getContext(currentOffset) === ClojureContext.OTHER
            && text[currentOffset] in brackets.keys)
        {
            closeBracketStack.push(brackets[text[currentOffset]]);
        }
    }

    // find the first open bracket before the start of the selection
    for (; currentOffset >= 0; currentOffset--) {
        if (contextResolver.getContext(currentOffset) === ClojureContext.OTHER
            && text[currentOffset] in brackets.keys)
        {
            closeBracketStack.push(brackets[text[currentOffset]]);
            break;
        }
    }

    // include prefixes like ' and # in the form
    for (let i = 1; currentOffset - i > 0; i++) {
        // a string literal, character literal, or comment can't be part of a prefix
        if (contextResolver.getContext(currentOffset) !== ClojureContext.OTHER) {
            break;
        }

        const char = text[currentOffset - i];
        if (char.trim() === '') { // whitespace ends the search for a prefix
            break;
        }
        if (i === 1 && (char === "'"    // this is a prefix like: '(1 2 3)
                        || char === '`' 
                        || char === '^')
            || char === '#') // this is a prefix like: #person{:name "Han Solo"} or #?@(:clj [3 4] :cljs [5 6])
        {
            currentOffset -= i; // include the prefix
            break;
        }
    }
    
    const formStartOffset = currentOffset;

    // find matching closing brackets for the brackets previously seen
    for (currentOffset = endOffset;
         currentOffset < text.length && closeBracketStack.length > 0;
         currentOffset++)
    {
        if (contextResolver.getContext(currentOffset) === ClojureContext.OTHER
            && text[currentOffset] === closeBracketStack[closeBracketStack.length - 1])
        {
                closeBracketStack.pop();
        }
    }

    return [formStartOffset, currentOffset];
}
