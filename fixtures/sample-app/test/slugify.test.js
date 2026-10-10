import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.js';

test('lowercases', () => assert.equal(slugify('Hello World'), 'hello-world'));
test('collapses repeated separators', () => assert.equal(slugify('a   b -- c'), 'a-b-c'));
test('drops punctuation', () => assert.equal(slugify('What’s new, ATLAS?'), 'whats-new-atlas'));
test('trims leading and trailing dashes', () => assert.equal(slugify('  --Ship it--  '), 'ship-it'));
test('keeps digits', () => assert.equal(slugify('Release 2.0 notes'), 'release-20-notes'));
