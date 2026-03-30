require('dotenv').config();

import { client } from '../client';
import {
  CHANNEL_INDEX,
  CHAT_INDEX,
  DOCUMENT_INDEX,
  IS_DRY_RUN,
} from '../constants';
import { copyFieldData } from '../utils/copy_field';

const INDICES_TO_UPDATE = [DOCUMENT_INDEX, CHAT_INDEX, CHANNEL_INDEX];

async function addContentPrefixedField(dryRun: boolean) {
  const opensearchClient = client();

  console.log('\n' + '='.repeat(60));
  console.log(
    `Add content_prefixed field with index_prefixes ${dryRun ? '(DRY-RUN MODE)' : '(LIVE MODE)'}`
  );
  console.log('='.repeat(60));
  console.log(
    '\nThis script adds a text field with index_prefixes to eliminate'
  );
  console.log('the max_expansions limit on match_phrase_prefix queries.');
  console.log('It replaces the slow wildcard(*foo*) query pattern.\n');
  console.log(
    "Safe to run multiple times - backfill only updates documents where the new field doesn't exist."
  );

  if (dryRun) {
    console.log('\n  DRY-RUN MODE: No changes will be made');
  }

  const mappingUpdate = {
    properties: {
      content_prefixed: {
        type: 'text' as const,
        analyzer: 'standard',
        index_prefixes: {
          min_chars: 2,
          max_chars: 5,
        },
      },
    },
  };

  for (const indexName of INDICES_TO_UPDATE) {
    console.log(`\n--- ${indexName} ---`);

    const indexExists = (
      await opensearchClient.indices.exists({ index: indexName })
    ).body;

    if (!indexExists) {
      console.log(`  Index "${indexName}" does not exist. Skipping.`);
      continue;
    }

    if (dryRun) {
      console.log(
        `  [DRY-RUN] Would add content_prefixed field mapping to ${indexName}`
      );
    } else {
      const putMappingResponse = await opensearchClient.indices.putMapping({
        index: indexName,
        body: mappingUpdate,
      });

      if (!putMappingResponse.body.acknowledged) {
        throw new Error(
          `Failed to add content_prefixed mapping to ${indexName}`
        );
      }
      console.log(`  content_prefixed field mapping added to ${indexName}`);
    }

    await copyFieldData(
      opensearchClient,
      indexName,
      'content',
      'content_prefixed',
      dryRun
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\nTo run for real, set DRY_RUN=false environment variable');
  } else {
    console.log(
      '\n  content_prefixed field has been added and backfilled across all indices.'
    );
    console.log(
      '  Run this script again after deploying new code to catch documents added during migration.'
    );
  }
}

addContentPrefixedField(IS_DRY_RUN);
