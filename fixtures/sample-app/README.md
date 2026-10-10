# atlas-sample-app

`slugify(title)` turns a post title into a URL slug. ATLAS-SAMPLE

Known bug: titles with uppercase letters, punctuation or repeated spaces produce invalid slugs.
The tests in `test/slugify.test.js` describe the expected behavior. Run them with `npm test`.
