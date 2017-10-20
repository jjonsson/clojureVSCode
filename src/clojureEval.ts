import * as vscode from 'vscode';

import { cljConnection } from './cljConnection';
import { cljParser } from './cljParser';
import { nreplClient } from './nreplClient';
import { getCurrentForm } from './clojureContext';

export function clojureEval(outputChannel: vscode.OutputChannel): void {
    evaluate(outputChannel, getCurrentSelection(),  false);
}

export function clojureEvalAndShowResult(outputChannel: vscode.OutputChannel): void {
    evaluate(outputChannel, getCurrentSelection(), true);
}

export function clojureEvalCurrentForm(outputChannel: vscode.OutputChannel): void {
    evaluate(outputChannel, getCurrentFormRange(), true);
}

function getCurrentSelection(): vscode.Range {
    return vscode.window.activeTextEditor.selection;
}

function evaluate(outputChannel: vscode.OutputChannel, range: vscode.Range, showResults: boolean): void {
    if (!cljConnection.isConnected()) {
        vscode.window.showWarningMessage('You should connect to nREPL first to evaluate code.');
        return;
    }

    const editor = vscode.window.activeTextEditor;

    let text = editor.document.getText();
    if (!range.isEmpty) {
        const ns: string = cljParser.getNamespace(text);
        text = `(ns ${ns})\n${editor.document.getText(range)}`;
    }

    cljConnection.sessionForFilename(editor.document.fileName).then(session => {
        let response;
        if (!range.isEmpty && session.type == 'ClojureScript') {
            // Piggieback's evalFile() ignores the text sent as part of the request
            // and just loads the whole file content from disk. So we use eval()
            // here, which as a drawback will give us a random temporary filename in
            // the stacktrace should an exception occur.
            response = nreplClient.evaluate(text, session.id);
        } else {
            response = nreplClient.evaluateFile(text, editor.document.fileName, session.id);
        }
        response.then(respObjs => {
            if (!!respObjs[0].ex)
                return handleError(outputChannel, range, showResults, respObjs[0].session);

            return handleSuccess(outputChannel, showResults, respObjs);
        })
    });
}

function handleError(outputChannel: vscode.OutputChannel, range: vscode.Range, showResults: boolean, session: string): Promise<void> {
    if (!showResults)
        vscode.window.showErrorMessage('Compilation error');

    return nreplClient.stacktrace(session)
        .then(stacktraceObjs => {
            const stacktraceObj = stacktraceObjs[0];

            let errLine = stacktraceObj.line !== undefined ? stacktraceObj.line - 1 : 0;
            let errChar = stacktraceObj.column !== undefined ? stacktraceObj.column - 1 : 0;

            if (!range.isEmpty) {
                errLine += range.start.line;
                errChar += range.start.character;
            }

            outputChannel.appendLine(`${stacktraceObj.class} ${stacktraceObj.message}`);
            outputChannel.appendLine(` at ${stacktraceObj.file}:${errLine}:${errChar}`);

            stacktraceObj.stacktrace.forEach(trace => {
                if (trace.flags.indexOf('tooling') > -1)
                    outputChannel.appendLine(`    ${trace.class}.${trace.method} (${trace.file}:${trace.line})`);
            });

            outputChannel.show();
            nreplClient.close(session);
        });
}

function handleSuccess(outputChannel: vscode.OutputChannel, showResults: boolean, respObjs: any[]): void {
    if (!showResults) {
        vscode.window.showInformationMessage('Successfully compiled');
    } else {
        respObjs.forEach(respObj => {
            if (respObj.out)
                outputChannel.append(respObj.out);
            if (respObj.err)
                outputChannel.append(respObj.err);
            if (respObj.value)
                outputChannel.appendLine(`=> ${respObj.value}`);
            outputChannel.show();
        });
    }
    nreplClient.close(respObjs[0].session);
}

// find the range that contains just the current form
function getCurrentFormRange(): vscode.Range {
    const document = vscode.window.activeTextEditor.document;
    
    const text = document.getText(new vscode.Range(document.positionAt(0),
                                  document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end));

    const startOffset = document.offsetAt(getCurrentSelection().start);
    const endOffset = document.offsetAt(getCurrentSelection().end);

    const [formStartOffset, formEndOffset] = getCurrentForm(text, startOffset, endOffset);

    return new vscode.Range(document.positionAt(formStartOffset), document.positionAt(formEndOffset));
}
