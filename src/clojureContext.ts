export enum ClojureContext {
    STRING = 'string',
    COMMENT = 'comment',
    OTHER = 'other'
}

interface ContextRange {
    type: ClojureContext;
    range: [number, number];
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

    // parse a document for strings and comments (this is where the hard work is done)
    public constructor(document: string) {
        this.contexts = [];
        this.document = document;

        let inString = false;
        let stringStartIndex: number = null;

        for (let offset = 0; offset < document.length; offset++) {
            // match the next few characters with a given word
            const lookahead = (match: string) => {
                for (let i = 0; i < match.length; i++) {
                    if (offset + i >= document.length) { // we've gone of the end of the document
                        return false;
                    }
                    if (document[offset + i] !== match[i]) { // this character doesn't match
                        return false;
                    }
                }
                return true;
            };

            if (inString) {
                if (document[offset] === '\\') { // Java escape character
                    offset++; // skip one character
                }
                else if (document[offset] === '"') {
                    inString = false;
                    const endIndex = offset + 1;
                    this.contexts.push({
                        type: ClojureContext.STRING,
                        range: [stringStartIndex, endIndex]
                    });
                    stringStartIndex = null;
                }
            }
            else {
                if (document[offset] === '\\') {
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
                }
                else if (document[offset] === '"') {
                    inString = true;
                    stringStartIndex = offset;
                }
                else if (document[offset] === ';') {
                    const startPosition = offset;

                    // seek ahead to the end of the line
                    while (document[offset] !== '\n') {
                        offset++;
                    }

                    const endPosition = offset + 1;
                    this.contexts.push({
                        type: ClojureContext.COMMENT,
                        range: [startPosition, endPosition]
                    });
                }
            }
        }
    }

    // binary search for a context that contains this offset
    private findContext(offset: number, startIndex: number, endIndex: number): ClojureContext {
        const contains = (range: [number, number], i: number) => 
            range[0] < i || i <= range[1];

        const pivotIndex = Math.floor((endIndex - startIndex) / 2) + startIndex;
        if (startIndex === endIndex) { // base case
            return ClojureContext.OTHER;
        }
        else if (contains(this.contexts[pivotIndex].range, offset)) {
            return this.contexts[pivotIndex].type;
        }
        else if (offset < this.contexts[pivotIndex].range[0]) {
            return this.findContext(offset, startIndex, pivotIndex);
        }
        else if (offset >= this.contexts[pivotIndex].range[0]) {
            return this.findContext(offset, pivotIndex, endIndex);
        }
        console.error('Context search function exceeded the bounds of the document.');
        return ClojureContext.OTHER;
    }

    // search the document to figure out what kind of context the offset is in (like string or comment)
    public getContext(offset: number): ClojureContext {
        return this.findContext(offset, 0, this.contexts.length);
    }
}