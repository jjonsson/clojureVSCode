import * as assert from 'assert';
import {ClojureContext, ClojureContextResolver}  from '../src/clojureContext';

suite('clojureContext', () => {
    const cases: Array<[ClojureContext, string, number]> = [
        [ClojureContext.OTHER, '', 0],
        [ClojureContext.OTHER, '(ns foo)', 2],
        [ClojureContext.STRING, '(ns "foo")', 5],
        [ClojureContext.STRING, '(ns "foo")', 8],
        [ClojureContext.OTHER, '(ns "foo")', 4],
        [ClojureContext.OTHER, '(ns "foo")', 9],
        [ClojureContext.OTHER, '(ns "foo");(println "bar")\n(ns baz)', 10],
        [ClojureContext.COMMENT, '(ns "foo");(println "bar")\n(ns baz)', 26],
        [ClojureContext.OTHER, '(ns "foo");(println "bar")\n(ns baz)', 27],
        [ClojureContext.OTHER, '(ns "foo");(println "bar")\n(ns baz)', 1],
    ];
    for (let [want, document, offset] of cases) {
        test(`new ClojureContextResolver(${document}).getContext("${offset}") should be "${want}"`, () => {
            const resolver = new ClojureContextResolver(document);
            assert.equal(resolver.getContext(offset), want);
        })
    }
});