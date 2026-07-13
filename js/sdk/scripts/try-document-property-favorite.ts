// Demo: create a document, set a property on it, then favorite it.
//   MACRO_TOKEN=mk_live_... bun scripts/try-document-property-favorite.ts <property-definition-id>
//
// The property-definition-id is the id of any property definition visible to
// your account — run `macro.properties.definitions()` to list them.

import { Macro } from '../src/macro';

const token = process.env.MACRO_TOKEN;
if (!token) throw new Error('set MACRO_TOKEN (see comment at top of file)');

const propertyId = process.argv[2];
if (!propertyId)
  throw new Error(
    'usage: bun scripts/try-document-property-favorite.ts <property-definition-id>',
  );

const macro = new Macro({ token, env: 'dev' });

// 1. Create a new document.
const doc = await macro.documents.create({
  name: 'SDK demo document',
  markdown: '# Hello from the SDK\n\nCreated, propertied, and favorited in one script.',
});
console.log('created document:', doc.id);

// 2. Add a property to it.
await doc.setProperty(propertyId);
console.log('set property:', propertyId);

// 3. Favorite the document.
const fav = await doc.favorite();
console.log('favorited:', fav.id);
