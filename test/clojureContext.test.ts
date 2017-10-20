import * as assert from 'assert';
import {ClojureContext, ClojureContextResolver, getCurrentForm}  from '../src/clojureContext';

suite('clojureContext', () => {
    const cases: Array<[ClojureContext, string, number]> = [
        [ClojureContext.OTHER, '', 0],
        [ClojureContext.OTHER, '(ns foo)', 2],
        [ClojureContext.STRING_LITERAL, '(ns "foo")', 5],
        [ClojureContext.STRING_LITERAL, '(ns "f\\"oo")', 8],
        [ClojureContext.STRING_LITERAL, '(ns \\; "foo")', 11],
        [ClojureContext.STRING_LITERAL, '(ns "f;oo")', 8],
        [ClojureContext.OTHER, '(ns "foo")', 4],
        [ClojureContext.OTHER, '(ns "foo")', 9],
        [ClojureContext.OTHER, '(ns "foo");(println "bar")\n(ns baz)', 10],
        [ClojureContext.COMMENT, '(ns "foo");(println "bar")\n(ns baz)', 26],
        [ClojureContext.OTHER, '(ns "foo");(println "bar")\n(ns baz)', 27],
        [ClojureContext.OTHER, '(ns "foo");(println "bar")\n(ns baz)', 1],
        [ClojureContext.CHARACTER_LITERAL, '(ns \\;);(println "bar")\n(ns baz)', 5],
        [ClojureContext.CHARACTER_LITERAL, '(ns \\");(println "bar")\n(ns baz)', 5],
    ];
    for (let [want, document, offset] of cases) {
        test(`new ClojureContextResolver(${document}).getContext(${offset}) should be "${want}"`, () => {
            const resolver = new ClojureContextResolver(document);
            assert.equal(resolver.getContext(offset), want);
        })
    }
    const text = '(defn primes< [n] (if (<= n 2) () (remove (into #{} (mapcat #(range (* % %) n %)) (range 3 (Math/sqrt n) 2)) (cons 2 (range 3 n 2)))))';
    const forms: Array<[string, number, number]> = [
        ['#{}', 49, 50]
    ]

    for (let [want, start, end] of forms) {
        test(`getCurrentForm(text, ${start}, ${end}) should be "${want}"`, () => {
            assert.equal(getCurrentForm(text, start, end), want)
        })
    }
});